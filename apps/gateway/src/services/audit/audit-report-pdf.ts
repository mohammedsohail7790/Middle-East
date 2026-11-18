import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forRtl, hasArabic } from './audit-bidi.js';
import type { AuditReport } from './audit-report.js';
import { priceText } from './audit-pricing.js';

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

/** "1 week", "6 weeks"; in Arabic the noun changes with the number (واحد, أسبوعان, 3-10 أسابيع, 11+ أسبوعاً). */
export function weeksText(n: number, lang: 'en' | 'ar'): string {
  if (lang === 'en') return n === 1 ? '1 week' : `${n} weeks`;
  if (n === 1) return 'أسبوع واحد';
  if (n === 2) return 'أسبوعان';
  return n <= 10 ? `${n} أسابيع` : `${n} أسبوعاً`;
}

/** "6 to 9 weeks", or "3 weeks" when low and high are the same. */
export function weeksRange(min: number, max: number, lang: 'en' | 'ar'): string {
  if (min === max) return weeksText(max, lang);
  if (lang === 'en') return `${min} to ${max} weeks`;
  return `من ${min} إلى ${max} ${max <= 10 ? 'أسابيع' : 'أسبوعاً'}`;
}

const COPY = {
  en: {
    cover: 'AI & Workflow Automation Opportunity Audit',
    title: 'Operational Opportunity Audit',
    preparedFor: 'Prepared for',
    preparedBy: 'Prepared by',
    attention: 'Attention',
    date: 'Date',
    auditFee: 'Audit fee',
    signatory: 'Halla AI',
    signatoryNote: 'Powered by Clean Room LLC (dba Vertex Connect)',
    confidential: 'Confidential. Prepared for the named client only.',
    summary: '1. Executive Summary',
    findings: '2. Operational Diagnostics: How Things Work Today',
    considerations: '3. Key Assumptions & Risks',
    considerationsIntro: 'To keep this audit and the quote reliable, the following must be confirmed:',
    opportunities: '4. Identified Opportunities & Proposed Solutions',
    opportunitiesIntro: 'Where Halla AI’s automation and AI consultancy can directly affect your bottom line.',
    opportunity: 'Opportunity',
    problem: 'Today',
    solution: 'What we would build',
    payoff: 'The payoff',
    roadmap: '5. Proposed Roadmap',
    phase: 'Phase',
    timelineTotal: (r: string) => `Estimated timeline: ${r}. The clock starts once we have access to your systems.`,
    timelineNote: 'It moves with how quickly your team can answer questions and approve each step.',
    phaseTime: (n: string) => `(${n})`,
    investment: '6. Project Investment & Next Steps',
    fixedFee: 'Full project fixed fee',
    validity: (d: number) => `This fixed price is valid for ${d} days from the date of this audit.`,
    phase1: (n: string) => `Your stated budget is below the full scope. We recommend starting with a Phase 1 (Discovery & Architecture) engagement for ${n}, to confirm the technical approach before committing to the full build.`,
    credit: (fee: string | undefined, d: number) => `Audit fee credit: if you confirm the project within ${d} days of receiving this audit, ${fee ? `the ${fee}` : 'the'} audit fee is credited toward your implementation.`,
    nextSteps: 'Next steps',
    footer: 'Halla AI · www.hallaai.com · hello@hallaai.com',
    page: (n: number, t: number) => `Page ${n} of ${t}`,
  },
  ar: {
    cover: 'تدقيق فرص الذكاء الاصطناعي وأتمتة سير العمل',
    title: 'تدقيق الفرص التشغيلية',
    preparedFor: 'أُعدّ لـ',
    preparedBy: 'إعداد',
    attention: 'عناية',
    date: 'التاريخ',
    auditFee: 'رسوم التدقيق',
    signatory: 'Halla AI',
    signatoryNote: 'بدعم من Clean Room LLC · Vertex Connect',
    confidential: 'سري. أُعدّ للعميل المذكور فقط.',
    summary: '١. الملخص التنفيذي',
    findings: '٢. التشخيص التشغيلي: كيف تسير الأمور اليوم',
    considerations: '٣. الافتراضات والمخاطر الرئيسية',
    considerationsIntro: 'لضمان دقة هذا التدقيق وعرض السعر، يجب تأكيد ما يلي:',
    opportunities: '٤. الفرص المحددة والحلول المقترحة',
    opportunitiesIntro: 'حيث يمكن لأتمتة Halla AI واستشاراتها أن تؤثر مباشرة في نتائجك.',
    opportunity: 'الفرصة',
    problem: 'اليوم',
    solution: 'ما سنبنيه',
    payoff: 'العائد',
    roadmap: '٥. خارطة الطريق المقترحة',
    phase: 'المرحلة',
    timelineTotal: (r: string) => `الإطار الزمني المقدّر: ${r}. يبدأ العدّ بعد حصولنا على صلاحية الوصول إلى أنظمتكم.`,
    timelineNote: 'ويتأثر بسرعة ردّ فريقكم على الأسئلة وموافقته على كل خطوة.',
    phaseTime: (n: string) => `(${n})`,
    investment: '٦. استثمار المشروع والخطوات التالية',
    fixedFee: 'السعر الثابت للمشروع الكامل',
    validity: (d: number) => `هذا السعر الثابت صالح لمدة ${d} يوماً من تاريخ هذا التدقيق.`,
    phase1: (n: string) => `ميزانيتك المذكورة أقل من النطاق الكامل. نوصي بالبدء بمرحلة أولى (الاستكشاف وتصميم البنية) بمبلغ ${n}، للتحقق من النهج التقني قبل الالتزام بالبناء الكامل.`,
    credit: (fee: string | undefined, d: number) => `خصم رسوم التدقيق: إذا أكدتم المشروع خلال ${d} يوماً من استلام هذا التدقيق، تُخصم رسوم التدقيق${fee ? ` (${fee})` : ''} من تكلفة التنفيذ.`,
    nextSteps: 'الخطوات التالية',
    footer: 'Halla AI · www.hallaai.com · hello@hallaai.com',
    page: (n: number, t: number) => `صفحة ${n} من ${t}`,
  },
} as const;

const PAPER = '#FAF7F0';
const GOLD_LIGHT = '#C5A059';
const TODAY_BG = '#F1EEE8';
const BUILD_BG = '#FBF3DD';

/** A finding written as "Label: sentence" gets the label in bold, as in "Siloed Data: ...". */
const splitLabel = (raw: string): { label: string; rest: string } | null => {
  const s = raw.replace(/\*\*|__/g, ''); // reports drafted before the prompt change may still carry markdown asterisks
  const m = /^([^:.؟?!]{2,40}):\s+(.+)$/s.exec(s);
  return m ? { label: m[1], rest: m[2] } : null;
};

export async function renderReportPdf(report: AuditReport, env: NodeJS.ProcessEnv = process.env): Promise<Buffer> {
  const ar = report.lang === 'ar';
  const fonts = ar ? arabicFonts(env) : null;
  if (ar && !fonts) throw new ArabicFontMissingError();
  const t = COPY[report.lang];
  const fee = priceText('AED', env);

  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 72, left: LEFT, right: LEFT }, bufferPages: true, info: { Title: `${t.cover}: ${report.company}`, Author: 'Halla AI' } });
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
  const BOTTOM = 760;
  const ensure = (h: number) => { if (doc.y + h > BOTTOM) doc.addPage(); };
  const hOf = (text: string, size: number, font: string, width: number, gap = 3) => { doc.font(font).fontSize(size); return doc.heightOfString(vis(text), { width, lineGap: gap, features: ar ? ['rtla'] : undefined } as any); };

  // ---------- Cover page ----------
  doc.page.margins.bottom = 0; // the cover has text below the usual bottom margin; without this pdfkit would add a page
  doc.rect(0, 0, 595.28, 841.89).fill(INK);
  doc.rect(LEFT, 150, 40, 3).fill(GOLD_LIGHT);
  doc.font(bold).fontSize(13).fillColor(GOLD_LIGHT).text('HALLA AI', LEFT, 110, opts());
  doc.font(bold).fontSize(34).fillColor('#FFFFFF').text(vis(t.cover), LEFT, 185, opts({ lineGap: 4 }));
  doc.font(regular).fontSize(11).fillColor('#B9B4A6').text(vis(t.preparedFor.toUpperCase()), LEFT, 360, opts());
  doc.font(bold).fontSize(22).fillColor(GOLD_LIGHT).text(vis(report.company), LEFT, 378, opts());
  const meta: Array<[string, string]> = [[t.attention, report.preparedFor], [t.date, report.date]];
  if (fee) meta.push([t.auditFee, fee]);
  let my = 450;
  for (const [k, v] of meta) {
    doc.font(regular).fontSize(9).fillColor('#B9B4A6').text(vis(k.toUpperCase()), LEFT, my, opts());
    doc.font(regular).fontSize(13).fillColor('#FFFFFF').text(vis(v), LEFT, my + 13, opts());
    my += 46;
  }
  doc.moveTo(LEFT, 690).lineTo(LEFT + WIDTH, 690).lineWidth(0.6).strokeColor('#4a4d55').stroke();
  doc.font(regular).fontSize(9).fillColor('#B9B4A6').text(vis(t.preparedBy.toUpperCase()), LEFT, 702, opts());
  doc.font(bold).fontSize(14).fillColor('#FFFFFF').text(vis(t.signatory), LEFT, 716, opts());
  doc.font(regular).fontSize(9.5).fillColor('#B9B4A6').text(vis('www.hallaai.com · hello@hallaai.com'), LEFT, 735, opts());
  doc.font(regular).fontSize(9.5).fillColor('#B9B4A6').text(vis(t.signatoryNote), LEFT, 749, opts());
  doc.font(regular).fontSize(8).fillColor('#8d8a80').text(vis(t.confidential), LEFT, 790, opts());

  // ---------- Content ----------
  doc.addPage();
  doc.rect(0, 0, 595.28, 841.89).fill(PAPER);
  doc.on('pageAdded', () => { doc.rect(0, 0, 595.28, 841.89).fill(PAPER); doc.fillColor(INK); });
  doc.y = 64;

  const heading = (text: string) => {
    ensure(90);
    doc.moveDown(0.9).font(bold).fontSize(15).fillColor(INK).text(vis(text), LEFT, doc.y, opts());
    const x0 = ar ? LEFT + WIDTH - 36 : LEFT;
    doc.moveTo(x0, doc.y + 3).lineTo(x0 + 36, doc.y + 3).lineWidth(2).strokeColor(GOLD).stroke();
    doc.moveDown(0.7);
  };
  const body = (text: string, extra: Record<string, unknown> = {}) => doc.font(regular).fontSize(10.5).fillColor(INK).text(vis(text), LEFT, doc.y, opts({ lineGap: 3, ...extra }));
  const bullets = (items: string[]) => items.forEach((x) => { ensure(30); doc.font(regular).fontSize(10.5).fillColor(INK).text(vis(`•  ${x}`), LEFT, doc.y, opts({ lineGap: 3 })); doc.moveDown(0.25); });

  heading(t.summary);
  body(report.summary);

  if (report.findings.length) {
    heading(t.findings);
    for (const f of report.findings) {
      ensure(34);
      const parts = ar ? null : splitLabel(f); // pdfkit cannot mix two weights in one right-to-left line, so Arabic prints the line whole
      if (parts) {
        // The bold label and the sentence sit in one paragraph: label first in English, on the right in Arabic.
        doc.font(bold).fontSize(10.5).fillColor(INK).text(vis(`${parts.label}:`), LEFT, doc.y, opts({ continued: true, lineGap: 3 }));
        doc.font(regular).text(vis(` ${parts.rest}`), opts({ lineGap: 3 }));
      } else {
        doc.font(regular).fontSize(10.5).fillColor(INK).text(vis(`•  ${f.replace(/\*\*|__/g, '')}`), LEFT, doc.y, opts({ lineGap: 3 }));
      }
      doc.moveDown(0.3);
    }
  }

  if (report.considerations.length) {
    heading(t.considerations);
    doc.font(regular).fontSize(10).fillColor(GREY).text(vis(t.considerationsIntro), LEFT, doc.y, opts());
    doc.moveDown(0.4);
    bullets(report.considerations);
  }

  if (report.opportunities.length) {
    heading(t.opportunities);
    doc.font(regular).fontSize(10).fillColor(GREY).text(vis(t.opportunitiesIntro), LEFT, doc.y, opts());
    doc.moveDown(0.6);
    const GAP = 12;
    const COLW = (WIDTH - GAP) / 2;
    report.opportunities.forEach((o, i) => {
      const pad = 10;
      const inner = COLW - pad * 2;
      const todayH = hOf(o.problem || ' ', 10, regular, inner) + 22 + pad * 2;
      const buildH = hOf(o.solution || ' ', 10, regular, inner) + 22 + pad * 2;
      const cardH = Math.max(todayH, buildH);
      const payH = o.payoff ? hOf(o.payoff, 10, regular, WIDTH - 24) + 30 : 0;
      ensure(24 + cardH + payH + 14);
      doc.font(bold).fontSize(12).fillColor(INK).text(vis(`${t.opportunity} ${i + 1}: ${o.title}`), LEFT, doc.y, opts());
      doc.moveDown(0.4);
      const y = doc.y;
      // In Arabic the "today" card sits on the right, so the page reads from right to left.
      const xToday = ar ? LEFT + COLW + GAP : LEFT;
      const xBuild = ar ? LEFT : LEFT + COLW + GAP;
      const card = (x: number, bg: string, edge: string, label: string, text: string) => {
        doc.rect(x, y, COLW, cardH).fill(bg);
        doc.rect(ar ? x + COLW - 3 : x, y, 3, cardH).fill(edge);
        doc.font(bold).fontSize(8.5).fillColor(edge === GOLD ? GOLD : GREY).text(vis(label.toUpperCase()), x + pad, y + pad, { width: inner, align: ar ? 'right' : 'left', features: ar ? ['rtla'] : undefined } as any);
        doc.font(regular).fontSize(10).fillColor(INK).text(vis(text), x + pad, y + pad + 16, { width: inner, lineGap: 3, align: ar ? 'right' : 'left', features: ar ? ['rtla'] : undefined } as any);
      };
      card(xToday, TODAY_BG, '#9a9588', t.problem, o.problem);
      card(xBuild, BUILD_BG, GOLD, t.solution, o.solution);
      doc.y = y + cardH + 6;
      if (o.payoff) {
        const py = doc.y;
        doc.rect(LEFT, py, WIDTH, payH - 4).fill(INK);
        doc.font(bold).fontSize(8.5).fillColor(GOLD_LIGHT).text(vis(t.payoff.toUpperCase()), LEFT + 12, py + 8, { width: WIDTH - 24, align: ar ? 'right' : 'left', features: ar ? ['rtla'] : undefined } as any);
        doc.font(regular).fontSize(10).fillColor('#FFFFFF').text(vis(o.payoff), LEFT + 12, py + 21, { width: WIDTH - 24, lineGap: 3, align: ar ? 'right' : 'left', features: ar ? ['rtla'] : undefined } as any);
        doc.y = py + payH + 4;
      }
      doc.moveDown(0.8);
    });
  }

  heading(t.roadmap);
  if (report.timeline) {
    const tl = report.timeline;
    doc.font(bold).fontSize(10.5).fillColor(INK).text(vis(t.timelineTotal(weeksRange(tl.weeksMin, tl.weeksMax, report.lang))), LEFT, doc.y, opts({ lineGap: 3 }));
    doc.font(regular).fontSize(9.5).fillColor(GREY).text(vis(t.timelineNote), LEFT, doc.y, opts({ lineGap: 3 }));
    doc.moveDown(0.8);
  }
  report.phases.forEach((p, i) => {
    ensure(70);
    const wk = report.timeline ? ` ${t.phaseTime(weeksText(report.timeline.phaseWeeks[i], report.lang))}` : '';
    doc.font(bold).fontSize(12).fillColor(INK).text(vis(`${t.phase} ${i + 1}: ${p.title}${wk}`), LEFT, doc.y, opts());
    doc.moveDown(0.25);
    bullets(p.deliverables);
    doc.moveDown(0.4);
  });

  heading(t.investment);
  ensure(150);
  const boxY = doc.y;
  const showPhase1 = report.investment.overBudget && report.investment.phase1Aed;
  const boxH = 64;
  doc.rect(LEFT, boxY, WIDTH, boxH).fill(INK);
  doc.font(regular).fontSize(9).fillColor(GOLD_LIGHT).text(vis(t.fixedFee.toUpperCase()), LEFT + 16, boxY + 12, { width: WIDTH - 32, align: ar ? 'right' : 'left', features: ar ? ['rtla'] : undefined } as any);
  doc.font(bold).fontSize(22).fillColor('#FFFFFF').text(vis(fmtAed(report.investment.feeAed)), LEFT + 16, boxY + 28, { width: WIDTH - 32, align: ar ? 'right' : 'left', features: ar ? ['rtla'] : undefined } as any);
  doc.y = boxY + boxH + 10;
  body(t.validity(report.investment.validDays));
  if (showPhase1) { doc.moveDown(0.6); body(t.phase1(fmtAed(report.investment.phase1Aed as number))); }
  doc.moveDown(0.7);
  const creditText = t.credit(fee, report.investment.validDays);
  const creditH = hOf(creditText, 10, bold, WIDTH - 28) + 20;
  ensure(creditH + 10);
  const cy = doc.y;
  doc.rect(LEFT, cy, WIDTH, creditH).fill(BUILD_BG);
  doc.rect(ar ? LEFT + WIDTH - 3 : LEFT, cy, 3, creditH).fill(GOLD);
  doc.font(bold).fontSize(10).fillColor(INK).text(vis(creditText), LEFT + 14, cy + 10, { width: WIDTH - 28, lineGap: 3, align: ar ? 'right' : 'left', features: ar ? ['rtla'] : undefined } as any);
  doc.y = cy + creditH + 6;

  if (report.nextSteps.length) {
    ensure(70);
    doc.moveDown(0.6).font(bold).fontSize(12).fillColor(INK).text(vis(t.nextSteps), LEFT, doc.y, opts());
    doc.moveDown(0.3);
    bullets(report.nextSteps);
  }

  // Footer and page numbers on every page except the cover
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // The footer sits inside the bottom margin; without this, pdfkit starts a new page for it.
    doc.page.margins.bottom = 0;
    doc.moveTo(LEFT, 790).lineTo(LEFT + WIDTH, 790).lineWidth(0.5).strokeColor('#d9d3c3').stroke();
    doc.font(regular).fontSize(8).fillColor(GREY);
    doc.text(vis(t.footer), LEFT, 798, { width: WIDTH, align: 'center', lineBreak: false, features: ar ? ['rtla'] : undefined } as any);
    doc.text(vis(t.page(i + 1, range.count)), LEFT, 811, { width: WIDTH, align: 'center', lineBreak: false, features: ar ? ['rtla'] : undefined } as any);
  }

  doc.end();
  return done;
}
