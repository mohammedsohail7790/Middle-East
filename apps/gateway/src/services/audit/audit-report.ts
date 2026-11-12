import { quote, type Assessment, type Quote, type Rates } from './audit-estimate.js';

/**
 * The shape of an audit report, and the rules that keep the AI inside it.
 * The AI writes the words (summary, findings, opportunities, what each phase delivers, things to consider, next steps) and fills in the Assessment.
 * Code decides everything else: the language, the three phase titles, the fee, the Phase 1 offer and the validity period. The AI's text is cut to size and cleaned,
 * and anything that looks like a price or an hours figure is removed, so only the fee our code worked out can appear.
 */
export type Lang = 'en' | 'ar';

export interface AuditReport {
  lang: Lang;
  company: string;
  preparedFor: string;
  /** ISO date the report was drafted. */
  date: string;
  summary: string;
  findings: string[];
  opportunities: Array<{ title: string; problem: string; solution: string; payoff: string }>;
  phases: Array<{ title: string; deliverables: string[] }>;
  considerations: string[];
  nextSteps: string[];
  investment: { feeAed: number; phase1Aed: number | null; overBudget: boolean; validDays: number };
  /** For the team's review page only. Never printed in the client's PDF. */
  internal: { hoursMin: number; hoursMax: number; adjustments: Array<{ reason: string; min: number; max: number }>; complexity: Assessment['complexity'] };
}

/** What the AI returns. Every field is optional on purpose: a missing one is filled with a safe default rather than failing the whole draft. */
export interface RawDraft {
  assessment?: Partial<Assessment> & { complexity?: string };
  summary?: unknown;
  findings?: unknown;
  opportunities?: unknown;
  phaseDeliverables?: unknown;
  considerations?: unknown;
  nextSteps?: unknown;
}

export const PHASE_TITLES: Record<Lang, [string, string, string]> = {
  en: ['Architecture & API Discovery', 'Core Build & AI Integration', 'Testing, Human-in-the-Loop QA & Deployment'],
  ar: ['تصميم البنية واستكشاف واجهات البرمجة', 'البناء الأساسي والتكامل مع الذكاء الاصطناعي', 'الاختبار والمراجعة البشرية والإطلاق'],
};

export const VALID_DAYS = 30;

/** Arabic if most of the letters the client wrote are Arabic. The client's own words decide, not the page language. */
export function detectLang(answers: Record<string, string>): Lang {
  const text = Object.values(answers).join(' ');
  const arabic = (text.match(/[؀-ۿ]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return arabic > latin ? 'ar' : 'en';
}

/** A price or an hours figure: a currency sign or code next to a number, or a number of hours. */
const MONEY_OR_HOURS = /(?:AED|SAR|USD|QAR|KWD|BHD|OMR|dirhams?|\$|€|£)\s?\d|\d[\d,.]*\s?(?:k|K)?\s?(?:AED|SAR|USD|QAR|KWD|BHD|OMR|dirhams?)\b|\d+\s?(?:-|–|to)?\s?\d*\s?(?:engineering\s)?(?:hours?|hrs?)\b|\d\s?(?:ساعة|ساعات|درهم|دولار|ريال)/i;

/** Clean one piece of AI text. A sentence that quotes a price or hours is dropped whole, so no broken sentence is left behind. */
const clean = (v: unknown, max: number): string => {
  if (typeof v !== 'string') return '';
  const sentences = v.replace(/\s+/g, ' ').trim().split(/(?<=[.!?؟])\s+/);
  return sentences.filter((s) => !MONEY_OR_HOURS.test(s)).join(' ').trim().slice(0, max);
};

const list = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.map((x) => clean(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

const COMPLEXITY = new Set(['low', 'medium', 'high']);
const VOLUME = new Set(['low', 'high', 'unknown']);
const FORMAT = new Set(['structured', 'mixed', 'messy', 'unknown']);
const SYSTEMS = new Set(['cloud', 'mixed', 'legacy', 'unknown']);

/** Turn whatever the AI sent into a valid Assessment. Anything unclear becomes the cautious choice, so the price is never lower because of a gap. */
export function sanitizeAssessment(raw: RawDraft['assessment']): Assessment {
  const r = raw ?? {};
  const budget = typeof r.budgetMaxAed === 'number' && Number.isFinite(r.budgetMaxAed) && r.budgetMaxAed > 0 ? Math.round(r.budgetMaxAed) : null;
  return {
    complexity: COMPLEXITY.has(String(r.complexity)) ? (r.complexity as Assessment['complexity']) : 'medium',
    volume: VOLUME.has(String(r.volume)) ? (r.volume as Assessment['volume']) : 'unknown',
    dataFormat: FORMAT.has(String(r.dataFormat)) ? (r.dataFormat as Assessment['dataFormat']) : 'unknown',
    systems: SYSTEMS.has(String(r.systems)) ? (r.systems as Assessment['systems']) : 'unknown',
    humanApproval: r.humanApproval === true,
    budgetMaxAed: budget,
  };
}

export function assembleReport(args: {
  raw: RawDraft;
  lang: Lang;
  company: string;
  contactName: string;
  now: Date;
  rates?: Rates;
}): { report: AuditReport; assessment: Assessment; quote: Quote } {
  const assessment = sanitizeAssessment(args.raw.assessment);
  const q = quote(assessment, args.rates);
  const pd = Array.isArray(args.raw.phaseDeliverables) ? args.raw.phaseDeliverables : [];
  const opportunities = (Array.isArray(args.raw.opportunities) ? args.raw.opportunities : [])
    .map((o: any) => ({ title: clean(o?.title, 120), problem: clean(o?.problem, 500), solution: clean(o?.solution, 500), payoff: clean(o?.payoff, 300) }))
    .filter((o) => o.title && (o.problem || o.solution))
    .slice(0, 6);
  const report: AuditReport = {
    lang: args.lang,
    company: args.company,
    preparedFor: args.contactName,
    date: args.now.toISOString().slice(0, 10),
    summary: clean(args.raw.summary, 1200),
    findings: list(args.raw.findings, 8, 300),
    opportunities,
    phases: PHASE_TITLES[args.lang].map((title, i) => ({ title, deliverables: list(pd[i], 6, 200) })),
    considerations: list(args.raw.considerations, 6, 300),
    nextSteps: list(args.raw.nextSteps, 6, 200),
    investment: { feeAed: q.feeAed, phase1Aed: q.phase1Aed, overBudget: q.overBudget, validDays: VALID_DAYS },
    internal: { hoursMin: q.hours.min, hoursMax: q.hours.max, adjustments: q.hours.adjustments, complexity: assessment.complexity },
  };
  return { report, assessment, quote: q };
}

/** A report is ready to send only if the AI gave us real content, not just an empty shell. */
export function isUsable(report: AuditReport): boolean {
  return report.summary.length > 40 && report.opportunities.length >= 1 && report.phases.every((p) => p.deliverables.length >= 1);
}

/** What the team may change on the review page. The language, company, phase titles, validity and the internal estimate stay as drafted. */
export interface ReportEdits {
  summary?: unknown;
  findings?: unknown;
  opportunities?: unknown;
  phaseDeliverables?: unknown;
  considerations?: unknown;
  nextSteps?: unknown;
  feeAed?: unknown;
  phase1Aed?: unknown;
}

const plain = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const plainList = (v: unknown, maxItems: number, maxLen: number): string[] => (Array.isArray(v) ? v.map((x) => plain(x, maxLen)).filter(Boolean).slice(0, maxItems) : []);
const money = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[,\s]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n) : null;
};

/** Apply the team's edits to a report. Their text is kept as written (they may mention figures); only length and shape are limited. */
export function mergeEdits(report: AuditReport, edits: ReportEdits): AuditReport {
  const pd = Array.isArray(edits.phaseDeliverables) ? edits.phaseDeliverables : [];
  const opportunities = Array.isArray(edits.opportunities)
    ? edits.opportunities
        .map((o: any) => ({ title: plain(o?.title, 120), problem: plain(o?.problem, 600), solution: plain(o?.solution, 600), payoff: plain(o?.payoff, 400) }))
        .filter((o) => o.title && (o.problem || o.solution))
        .slice(0, 8)
    : report.opportunities;
  const fee = edits.feeAed === undefined ? report.investment.feeAed : (money(edits.feeAed) ?? report.investment.feeAed);
  const phase1 = edits.phase1Aed === undefined ? report.investment.phase1Aed : edits.phase1Aed === '' || edits.phase1Aed === null ? null : (money(edits.phase1Aed) ?? report.investment.phase1Aed);
  return {
    ...report,
    summary: edits.summary === undefined ? report.summary : plain(edits.summary, 1500),
    findings: edits.findings === undefined ? report.findings : plainList(edits.findings, 10, 400),
    opportunities,
    phases: report.phases.map((p, i) => ({ title: p.title, deliverables: edits.phaseDeliverables === undefined ? p.deliverables : plainList(pd[i], 8, 250) })),
    considerations: edits.considerations === undefined ? report.considerations : plainList(edits.considerations, 8, 400),
    nextSteps: edits.nextSteps === undefined ? report.nextSteps : plainList(edits.nextSteps, 8, 250),
    investment: { ...report.investment, feeAed: fee, phase1Aed: phase1 },
  };
}
