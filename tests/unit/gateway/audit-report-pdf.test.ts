import { describe, expect, it, vi } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { ArabicFontMissingError, arabicFonts, renderReportPdf } from '../../../apps/gateway/src/services/audit/audit-report-pdf.js';
import { assembleReport } from '../../../apps/gateway/src/services/audit/audit-report.js';

const raw = {
  assessment: { complexity: 'high', volume: 'high', dataFormat: 'messy', systems: 'legacy', humanApproval: true, budgetMaxAed: 20000 },
  summary: 'Acme re-types the same job details into three tools, which costs the office hours each week and causes missed invoices.',
  findings: ['Three tools hold the same data.', 'Invoices are sometimes missed.'],
  opportunities: [{ title: 'Capture each job once', problem: 'Typed three times.', solution: 'One entry feeds all three tools.', payoff: 'Less admin and fewer missed invoices.' }],
  phaseDeliverables: [['Map the job flow'], ['Build the connected workflow'], ['Test and hand over']],
  considerations: ['Confirm CRM admin access.'],
  nextSteps: ['Agree the scope.'],
};
const make = (r: any, lang: 'en' | 'ar' = 'en') => assembleReport({ raw: r, lang, company: 'Acme Property', contactName: 'Sam Lee', now: new Date('2026-11-12T00:00:00Z') }).report;
const text = async (buf: Buffer) => (await new PDFParse({ data: new Uint8Array(buf) }).getText()).text.replace(/\s+/g, ' ');

describe('audit report PDF', () => {
  it('renders a real PDF with the content, the fixed fee and a Phase 1 offer when over budget', async () => {
    const report = make(raw);
    const buf = await renderReportPdf(report);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const t = await text(buf);
    expect(t).toContain('Opportunity Audit');
    expect(t).toContain('Acme Property');
    expect(t).toContain('Sam Lee');
    expect(t).toContain(`AED ${report.investment.feeAed.toLocaleString('en-US')}`);
    expect(t).toContain('Phase 1: Architecture & API Discovery');
    expect(t).toContain('smaller Phase 1 of up to AED 20,000');
    expect(t).toContain('Powered by Clean Room LLC (dba Vertex Connect)');
  });

  it('never prints hours, rates or the internal section', async () => {
    const report = make(raw);
    const t = await text(await renderReportPdf(report));
    expect(t).not.toMatch(/\d\s?-?\s?\d*\s?(hours?|hrs?)\b|per hour|\/hr|hourly|blended|rate|tier|complexity|legacy or on-premise/i);
    expect(t).not.toContain(String(report.internal.hoursMax) + ' hours');
  });

  it('renders an Arabic report with the bundled font, with the fixed fee', async () => {
    const report = make({ ...raw, summary: 'تقوم شركة الأمل بإدخال بيانات الأعمال نفسها يدوياً في ثلاثة أنظمة مختلفة، مما يستهلك ساعات من وقت الفريق كل أسبوع.' }, 'ar');
    const buf = await renderReportPdf(report);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const t = await text(buf);
    expect(t).toContain(report.investment.feeAed.toLocaleString('en-US'));
    expect(t).toMatch(/[\u0600-\u06FF\uFB50-\uFEFF]/); // Arabic letters (or their shaped forms) made it into the file
  });

  it('refuses to render Arabic when no font file can be found, instead of printing boxes', async () => {
    const cwd = process.cwd();
    const spy = vi.spyOn(process, 'cwd').mockReturnValue('/nonexistent');
    try {
      await expect(renderReportPdf(make(raw, 'ar'), { AUDIT_PDF_ARABIC_FONT: '/nope/missing.ttf' } as any)).rejects.toBeInstanceOf(ArabicFontMissingError);
    } finally {
      spy.mockRestore();
    }
    expect(process.cwd()).toBe(cwd);
  });

  it('finds the bundled font from the repository root', () => {
    expect(arabicFonts({} as any)?.regular).toMatch(/NotoNaskhArabic-Regular\.ttf$/);
    expect(arabicFonts({ AUDIT_PDF_ARABIC_FONT: '/nope/missing.ttf' } as any)).toBeNull();
  });

  it('spreads a long report over several pages with page numbers', async () => {
    const long = make({ ...raw, opportunities: Array.from({ length: 5 }, (_, i) => ({ title: `Opportunity ${i}`, problem: 'p '.repeat(120), solution: 's '.repeat(120), payoff: 'x '.repeat(60) })) });
    const t = await text(await renderReportPdf(long));
    expect(t).toMatch(/Page 1 of [2-9]/);
  });

  it('does not add blank pages for the footer', async () => {
    const t = await text(await renderReportPdf(make(raw)));
    expect(t).toMatch(/Page 1 of [12]\b/);
    expect(t).not.toMatch(/Page [3-9] of/);
  });
});
