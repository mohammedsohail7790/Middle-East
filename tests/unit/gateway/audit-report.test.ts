import { describe, expect, it } from 'vitest';
import { assembleReport, detectLang, isUsable, PHASE_TITLES, sanitizeAssessment } from '../../../apps/gateway/src/services/audit/audit-report.js';

const goodRaw = {
  assessment: { complexity: 'medium', volume: 'high', dataFormat: 'structured', systems: 'cloud', humanApproval: false, budgetMaxAed: 30000 },
  summary: 'Acme runs quoting by hand across a CRM, an invoicing tool and a spreadsheet, and loses hours every week re-typing the same job details.',
  findings: ['Job data is typed three times.', 'No single view of open quotes.'],
  opportunities: [{ title: 'One-time job capture', problem: 'Details typed three times.', solution: 'Capture once, push everywhere.', payoff: 'About a day a week back for the office.' }],
  phaseDeliverables: [['Map the job data and the three tools'], ['Build the connected workflow'], ['Test with real jobs and hand over']],
  considerations: ['Confirm who can approve changes to the CRM.'],
  nextSteps: ['Agree the scope and the Phase 1 date.'],
};
const make = (raw: any, answers = 'x') => assembleReport({ raw, lang: detectLang({ a: answers }), company: 'Acme', contactName: 'Sam', now: new Date('2026-11-12T10:00:00Z') });

describe('audit report: language', () => {
  it('uses Arabic when most letters are Arabic, English otherwise', () => {
    expect(detectLang({ a: 'نريد أتمتة الفواتير وإدخال البيانات', b: 'CRM' })).toBe('ar');
    expect(detectLang({ a: 'We want to automate invoices', b: 'مرحبا' })).toBe('en');
    expect(detectLang({})).toBe('en');
  });
});

describe('audit report: assessment', () => {
  it('turns unclear AI output into the cautious choice', () => {
    expect(sanitizeAssessment({ complexity: 'extreme', volume: 'huge', budgetMaxAed: -5 } as any)).toEqual({
      complexity: 'medium', volume: 'unknown', dataFormat: 'unknown', systems: 'unknown', humanApproval: false, budgetMaxAed: null,
    });
    expect(sanitizeAssessment(undefined).complexity).toBe('medium');
  });
});

describe('audit report: assembly', () => {
  it('takes the fee, phase titles and validity from code, not from the AI', () => {
    const { report } = make({ ...goodRaw, summary: goodRaw.summary + ' This will cost AED 5,000 and take 12 hours.' });
    expect(report.investment.feeAed).toBe(26000); // medium (60h) + high-volume structured (5h) = 65h * 400
    expect(report.investment.validDays).toBe(30);
    expect(report.phases.map((p) => p.title)).toEqual(PHASE_TITLES.en);
  });

  it('strips money and hours figures the AI put into its text', () => {
    const { report } = make({
      ...goodRaw,
      summary: goodRaw.summary + ' Budget of $12,000 or 5,000 AED. Roughly 40 hours of work. Also SAR 900.',
      opportunities: [{ title: 'Save USD 3,000 a month', problem: 'Takes 20 hrs per week.', solution: 'Automate.', payoff: 'Worth 2500 AED monthly.' }],
    });
    const all = JSON.stringify([report.summary, report.opportunities]);
    expect(all).not.toMatch(/\$\s?\d|AED\s?\d|SAR\s?\d|USD\s?\d|\d\s?AED|\d+\s?hours|\d+\s?hrs/i);
  });

  it('keeps the hours only in the internal section', () => {
    const { report } = make(goodRaw);
    expect(report.internal).toMatchObject({ hoursMin: 40, hoursMax: 65, complexity: 'medium' });
  });

  it('offers a smaller Phase 1 when the budget is below the fee', () => {
    const { report } = make({ ...goodRaw, assessment: { ...goodRaw.assessment, complexity: 'high', budgetMaxAed: 10000 } });
    expect(report.investment.overBudget).toBe(true);
    expect(report.investment.phase1Aed).toBe(10000);
  });

  it('uses Arabic phase titles for an Arabic client', () => {
    const { report } = make(goodRaw, 'نريد أتمتة العمل');
    expect(report.lang).toBe('ar');
    expect(report.phases[0].title).toBe(PHASE_TITLES.ar[0]);
  });

  it('caps list lengths and ignores junk', () => {
    const { report } = make({ ...goodRaw, findings: Array.from({ length: 30 }, (_, i) => `finding ${i}`), opportunities: [null, 5, { title: '' }, ...goodRaw.opportunities] });
    expect(report.findings.length).toBe(8);
    expect(report.opportunities).toHaveLength(1);
  });

  it('is unusable when the AI returned an empty shell', () => {
    expect(isUsable(make({}).report)).toBe(false);
    expect(isUsable(make(goodRaw).report)).toBe(true);
  });
});

import { mergeEdits } from '../../../apps/gateway/src/services/audit/audit-report.js';

describe('audit report: team edits', () => {
  const base = () => make(goodRaw).report;

  it('applies edited text and keeps the figures the team writes', () => {
    const r = mergeEdits(base(), { summary: '  Edited   summary mentioning AED 5,000 audit fee.  ', nextSteps: ['One', '', 'Two'] });
    expect(r.summary).toBe('Edited summary mentioning AED 5,000 audit fee.');
    expect(r.nextSteps).toEqual(['One', 'Two']);
  });

  it('can change the fee and drop or set the Phase 1 offer', () => {
    const r = mergeEdits(base(), { feeAed: '28,000', phase1Aed: '12000' });
    expect(r.investment).toMatchObject({ feeAed: 28000, phase1Aed: 12000, validDays: 30 });
    expect(mergeEdits(r, { phase1Aed: '' }).investment.phase1Aed).toBeNull();
  });

  it('ignores a bad fee and never changes language, titles or the internal estimate', () => {
    const b = base();
    const r = mergeEdits(b, { feeAed: 'free', lang: 'ar', phases: [], internal: { hoursMax: 1 }, phaseDeliverables: [['A'], ['B'], ['C']] } as any);
    expect(r.investment.feeAed).toBe(b.investment.feeAed);
    expect(r.lang).toBe('en');
    expect(r.internal).toEqual(b.internal);
    expect(r.phases.map((p) => p.title)).toEqual(PHASE_TITLES.en);
    expect(r.phases[1].deliverables).toEqual(['B']);
  });

  it('leaves fields untouched when they are not in the edits', () => {
    const b = base();
    expect(mergeEdits(b, {})).toEqual(b);
  });
});
