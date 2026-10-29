/**
 * Form 1, the fit check: decides, from the answers a prospect gives on the public form, whether they look like a good client for Halla AI's consultancy.
 * The verdict is only a first read for a person (it goes at the top of the email); it never blocks a request and never sends anything to the prospect.
 *
 * Hk's direction: there is no hard limit of 50 people. A company with 30 warehouse staff may have a small office, and what matters is the ERP, the departments and the
 * processes. So company size is only a soft signal, office staff count more than total headcount, and a person decides. The first engagement is a paid audit of
 * 5,000 USD (one week, not credited against the build), so a budget below that is the main "not yet" signal. Every threshold is a named constant here.
 */

export const COMPANY_SIZES = ['1-5', '6-15', '16-50', '51-150', '150+'] as const;
export const OFFICE_SIZES = ['1-5', '6-15', '16-50', '51+'] as const;
export const DECIDER_ANSWERS = ['yes', 'shared', 'no'] as const;
export const HOURS_ANSWERS = ['under-5', '5-20', '20-50', 'over-50', 'unsure'] as const;
export const START_ANSWERS = ['this-month', '1-3-months', 'later', 'exploring'] as const;
/** Bands in US dollars. The audit is 5,000 USD and a first build usually adds 4,000 to 30,000 USD. */
export const BUDGET_ANSWERS = ['under-5000', '5000-10000', '10000-35000', 'over-35000', 'unsure'] as const;
/** GCC countries, and the currency we quote in for each. Anything else is quoted in US dollars. */
export const COUNTRIES = ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Other'] as const;

export const QUOTE_CURRENCY: Record<(typeof COUNTRIES)[number], string> = {
  'United Arab Emirates': 'AED',
  'Saudi Arabia': 'SAR',
  Qatar: 'QAR',
  Kuwait: 'KWD',
  Bahrain: 'BHD',
  Oman: 'OMR',
  Other: 'USD',
};

export type CompanySize = (typeof COMPANY_SIZES)[number];
export type OfficeSize = (typeof OFFICE_SIZES)[number];
export type Verdict = 'green' | 'amber' | 'red';

export interface FitInput {
  size: CompanySize;
  /** How many of those people work in an office or make decisions (not warehouse, field or shift staff). When given, this is what counts. */
  office?: OfficeSize;
  decider: (typeof DECIDER_ANSWERS)[number];
  /** Every area the prospect ticked for where time or money goes, comma separated. */
  pain: string;
  /** The prospect's own words about the problem. */
  problem: string;
  /** Departments in the company, comma separated. */
  departments?: string;
  hours?: (typeof HOURS_ANSWERS)[number];
  start: (typeof START_ANSWERS)[number];
  budget?: (typeof BUDGET_ANSWERS)[number];
  erp?: string;
}

export interface FitResult {
  verdict: Verdict;
  /** Short, plain reasons in the order they matter, for the top of the email. */
  reasons: string[];
}

/** A problem described in fewer characters than this reads as vague ("we want AI"). */
export const SPECIFIC_PROBLEM_MIN_CHARS = 25;
/** This many departments or more means a bigger scoping job. */
export const MANY_DEPARTMENTS = 6;
/** Large ERPs whose integration usually needs extra scoping on the call. */
const HEAVY_ERP = /\b(sap|netsuite|oracle|dynamics)\b/i;

const SIZE_LABEL: Record<CompanySize, string> = {
  '1-5': '1 to 5 people',
  '6-15': '6 to 15 people',
  '16-50': '16 to 50 people',
  '51-150': '51 to 150 people',
  '150+': 'more than 150 people',
};

export function assessFit(input: FitInput): FitResult {
  const reasons: string[] = [];
  const problem = (input.problem ?? '').trim();
  const departments = (input.departments ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const specific = problem.length >= SPECIFIC_PROBLEM_MIN_CHARS;
  let red = false;
  let amber = false;

  // Size is a soft signal. Office staff count more than total headcount, because warehouse or field staff do not change how many people decide or how complex the processes are.
  const officeBig = input.office === '51+';
  reasons.push(`Size: ${SIZE_LABEL[input.size]}${input.office ? `, ${input.office} of them in the office or deciding` : ''}.`);
  if (input.office === '1-5' || (!input.office && input.size === '1-5')) {
    reasons.push('Very small team: check it can afford the audit.');
    amber = true;
  }
  if (officeBig || (!input.office && input.size === '150+')) {
    reasons.push('Large office: check which departments and decision-makers are involved.');
    amber = true;
  }

  if (departments.length > 0) {
    reasons.push(`Departments (${departments.length}): ${departments.join(', ')}.`);
    if (departments.length >= MANY_DEPARTMENTS) {
      reasons.push('Many departments: a bigger audit to scope.');
      amber = true;
    }
  }

  if (input.erp && input.erp.trim() && !/^none$/i.test(input.erp.trim())) {
    reasons.push(`ERP: ${input.erp.trim()}${HEAVY_ERP.test(input.erp) ? ', needs integration scoping' : ''}.`);
    if (HEAVY_ERP.test(input.erp)) amber = true;
  } else {
    reasons.push('ERP: none.');
  }

  if (input.decider === 'no') {
    reasons.push('Decision: not the decision-maker, gathering information.');
    amber = true;
  } else {
    reasons.push(input.decider === 'yes' ? 'Decision: decides on projects like this.' : 'Decision: decides together with others.');
  }

  if (!specific) {
    reasons.push('Problem: described vaguely.');
    amber = true;
  } else {
    reasons.push('Problem: specific.');
  }

  // Bad signals that, together, mean "not now".
  let bad = 0;
  if (input.hours === 'under-5') {
    reasons.push('Time lost: under 5 hours a week.');
    bad++;
  } else if (!input.hours || input.hours === 'unsure') {
    reasons.push('Time lost: not sure.');
    amber = true;
  } else {
    reasons.push('Time lost: 5 hours a week or more.');
  }

  if (input.budget === 'under-5000') {
    reasons.push('Budget: under 5,000 USD, below the audit price.');
    bad++;
  } else if (!input.budget || input.budget === 'unsure') {
    reasons.push('Budget: not stated.');
    amber = true;
  }

  if (input.start === 'exploring') {
    reasons.push('Timing: just exploring.');
    bad++;
  } else if (input.start === 'later') {
    reasons.push('Timing: later.');
    amber = true;
  }

  if (bad >= 2) red = true;
  else if (bad === 1) amber = true;

  const verdict: Verdict = red ? 'red' : amber ? 'amber' : 'green';
  return { verdict, reasons };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  green: 'GREEN: a good fit. Review it, then arrange a call.',
  amber: 'AMBER: unclear. Call first.',
  red: 'RED: not a fit now. Reply politely.',
};
