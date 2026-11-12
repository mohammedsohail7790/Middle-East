import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forRtl, hasArabic } from './audit-bidi.js';
import type { AuditReport } from './audit-report.js';

/**
 * The client's PDF. It shows the fixed fee and the three phases, never hours or rates (those are in report.internal, which is not printed here).
 * English uses the built-in fonts. Arabic uses the Noto Naskh Arabic font shipped in apps/gateway/assets/fonts (SIL Open Font License); AUDIT_PDF_ARABIC_FONT can point to another
 * font file. If no font file can be found, Arabic reports refuse to render rather than print boxes, and the delivery step tells the team to send that report by hand.
 */
const INK = '#16181c';
const GOLD = '#85631F';
const GREY = '#5b5f66';
const LEFT = 56;
const WIDTH = 595.28 - 112;

/** Where the Arabic fonts are: the environment variable first, then the copy shipped in the repo (checked from the working directory and from this file). */
export function arabicFonts(env: NodeJS.ProcessEnv = process.env): { regular: string; bold: string } | null {
  const here = (() => { try { return fileURLToPath(new URL('.', import.meta.url)); } catch { return ''; } })();
  const dirs = [join(process.cwd(), 'apps/gateway/assets/fonts'), join(process.cwd(), 'assets/fonts'), here && join(here, '../../../assets/fonts'), here && join(here, '../../../../../../assets/fonts')].filter(Boolean) as string[];
  const custom = env.AUDIT_PDF_ARABIC_FONT;
  if (custom) return existsSync(custom) ? { regular: custom, bold: env.AUDIT_PDF_ARABIC_FONT_BOLD && existsSync(env.AUDIT_PDF_ARABIC_FONT_BOLD) ? env.AUDIT_PDF_ARABIC_FONT_BOLD : custom } : null;
  for (const d of dirs) {
    const regular = join(d, 'NotoNaskhArabic-Regular.ttf');
    if (existsSync(regular)) return { regular, bold: existsSync(join(d, 'NotoNaskhArabic-Bold.ttf')) ? join(d, 'NotoNaskhArabic-Bold.ttf') : regular };
  }
  return null;
}

export class ArabicFontMissingError extends Error {
  constructor() {
    super('No Arabic font file was found (apps/gateway/assets/fonts or AUDIT_PDF_ARABIC_FONT), so an Arabic report cannot be rendered');
  }
}

const fmtAed = (n: number): string => `AED ${n.toLocaleString('en-US')}`;

const COPY = {
  en: {
    title: 'Opportunity Audit',
    preparedFor: 'Prepared for',
    date: 'Date',
    summary: 'Summary',
    findings: 'How things work today',
    opportunities: 'Opportunities',
    problem: 'Today',
    solution: 'What we would build',
    payoff: 'Payoff',
    roadmap: 'Roadmap',
    phase: 'Phase',
    investment: 'Project investment',
    fixedFee: 'Fixed fee',
    validity: (d: number) => `This fixed price is valid for ${d} days from the date of this report. It is not credited against the audit fee.`,
    phase1: (n: string) => `Your stated budget is below the full scope, so we suggest starting with a smaller Phase 1 of up to ${n}, and adding the rest later.`,
    considerations: 'Things to confirm',
    nextSteps: 'Next steps',
    footer: 'Halla AI · Powered by Clean Room LLC (dba Vertex Connect) · hello@hallaai.com',
    page: (n: number, t: number) => `Page ${n} of ${t}`,
  },
  ar: {
    title: 'تدقيق الفرص',
    preparedFor: 'أُعدّ لـ',
    date: 'التاريخ',
    summary: 'الملخص',
    findings: 'كيف تسير الأمور اليوم',
    opportunities: 'الفرص',
    problem: 'اليوم',
    solution: 'ما سنبنيه',
    payoff: 'العائد',
    roadmap: 'خارطة الطريق',
    phase: 'المرحلة',
    investment: 'استثمار المشروع',
    fixedFee: 'سعر ثابت',
    validity: (d: number) => `هذا السعر الثابت صالح لمدة ${d} يوماً من تاريخ هذا التقرير، ولا يُخصم من رسوم التدقيق.`,
    phase1: (n: string) => `ميزانيتك المذكورة أقل من النطاق الكامل، لذلك نقترح البدء بمرحلة أولى أصغر بحدود ${n}، وإضافة الباقي لاحقاً.`,
    considerations: 'أمور يجب تأكيدها',
    nextSteps: 'الخطوات التالية',
    footer: 'بدعم من Clean Room LLC · Vertex Connect · Halla AI · hello@hallaai.com',
    page: (n: number, t: number) => `صفحة ${n} من ${t}`,
  },
} as const;

export async function renderReportPdf(report: AuditReport, env: NodeJS.ProcessEnv = process.env): Promise<Buffer> {
  const ar = report.lang === 'ar';
  const fonts = ar ? arabicFonts(env) : null;
  if (ar && !fonts) throw new ArabicFontMissingError();
  const t = COPY[report.lang];

  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 72, left: LEFT, right: LEFT }, bufferPages: true, info: { Title: `${t.title}: ${report.company}`, Author: 'Halla AI' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const regular = fonts ? fonts.regular : 'Helvetica';
  const bold = fonts ? fonts.bold : 'Helvetica-Bold';
  /** Arabic lines get their Latin words, numbers and brackets put in the order the writer needs. Pure Latin lines are left alone. */
  const vis = (s: string): string => (ar && hasArabic(s) ? forRtl(s) : s);
  const opts = (extra: Record<string, unknown> = {}) => ({ width: WIDTH, align: ar ? 'right' : 'left', features: ar ? ['rtla'] : undefined, ...extra }) as any;

  const heading = (text: string) => {
    if (doc.y > 630) doc.addPage();
    doc.moveDown(1.1).font(bold).fontSize(15).fillColor(INK).text(vis(text), LEFT, doc.y, opts());
    const x0 = ar ? LEFT + WIDTH - 36 : LEFT;
    doc.moveTo(x0, doc.y + 3).lineTo(x0 + 36, doc.y + 3).lineWidth(2).strokeColor(GOLD).stroke();
    doc.moveDown(0.7);
  };
  const body = (text: string, extra: Record<string, unknown> = {}) => doc.font(regular).fontSize(10.5).fillColor(INK).text(vis(text), LEFT, doc.y, opts({ lineGap: 3, ...extra }));
  const bullets = (items: string[]) => items.forEach((x) => { doc.font(regular).fontSize(10.5).fillColor(INK).text(vis(`•  ${x}`), LEFT, doc.y, opts({ lineGap: 3 })); doc.moveDown(0.25); });

  // Cover block
  doc.rect(0, 0, 595.28, 150).fill(INK);
  doc.font(bold).fontSize(11).fillColor('#C5A059').text('HALLA AI', LEFT, 48, opts());
  doc.font(bold).fontSize(26).fillColor('#FFFFFF').text(vis(t.title), LEFT, 70, opts());
  doc.font(regular).fontSize(12).fillColor('#E9E3D3').text(vis(report.company), LEFT, 108, opts());
  doc.y = 175;
  doc.font(regular).fontSize(10).fillColor(GREY).text(vis(`${t.preparedFor}: ${report.preparedFor}     ${t.date}: ${report.date}`), LEFT, doc.y, opts());

  heading(t.summary);
  body(report.summary);

  if (report.findings.length) { heading(t.findings); bullets(report.findings); }

  if (report.opportunities.length) {
    heading(t.opportunities);
    report.opportunities.forEach((o, i) => {
      if (doc.y > 650) doc.addPage();
      doc.font(bold).fontSize(12).fillColor(INK).text(vis(`${i + 1}. ${o.title}`), LEFT, doc.y, opts());
      doc.moveDown(0.2);
      for (const [label, text] of [[t.problem, o.problem], [t.solution, o.solution], [t.payoff, o.payoff]] as const) {
        if (!text) continue;
        doc.font(bold).fontSize(9).fillColor(GOLD).text(vis(label.toUpperCase()), LEFT, doc.y, opts());
        body(text);
        doc.moveDown(0.2);
      }
      doc.moveDown(0.5);
    });
  }

  heading(t.roadmap);
  report.phases.forEach((p, i) => {
    if (doc.y > 660) doc.addPage();
    doc.font(bold).fontSize(12).fillColor(INK).text(vis(`${t.phase} ${i + 1}: ${p.title}`), LEFT, doc.y, opts());
    doc.moveDown(0.25);
    bullets(p.deliverables);
    doc.moveDown(0.4);
  });

  heading(t.investment);
  doc.font(bold).fontSize(20).fillColor(INK).text(vis(`${t.fixedFee}: ${fmtAed(report.investment.feeAed)}`), LEFT, doc.y, opts());
  doc.moveDown(0.5);
  body(t.validity(report.investment.validDays));
  if (report.investment.overBudget && report.investment.phase1Aed) { doc.moveDown(0.6); body(t.phase1(fmtAed(report.investment.phase1Aed))); }

  if (report.considerations.length) { heading(t.considerations); bullets(report.considerations); }
  if (report.nextSteps.length) { heading(t.nextSteps); bullets(report.nextSteps); }

  // Footer and page numbers on every page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // The footer sits inside the bottom margin; without this, pdfkit starts a new page for it.
    doc.page.margins.bottom = 0;
    doc.font(regular).fontSize(8).fillColor(GREY);
    doc.text(vis(t.footer), LEFT, 800, { width: WIDTH, align: 'center', lineBreak: false, features: ar ? ['rtla'] : undefined } as any);
    doc.text(vis(t.page(i + 1, range.count)), LEFT, 812, { width: WIDTH, align: 'center', lineBreak: false, features: ar ? ['rtla'] : undefined } as any);
  }

  doc.end();
  return done;
}
