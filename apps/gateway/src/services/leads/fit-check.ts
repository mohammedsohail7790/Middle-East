/**
 * Form 1, the fit check: decides, from the answers a prospect gives on the public form, whether they look like a good fit for Halla AI's consultancy.
 * The verdict is only a first read for a person (it goes at the top of the email); it never blocks a request and never sends anything to the prospect.
 *
 * The rules follow the "How we judge fit" table in the intake draft. They are a proposal for Hk to adjust, so every threshold is a named constant here.
 * We target small and medium companies up to 50 people.
 */

export const COMPANY_SIZES = ['1-5', '6-15', '16-30', '31-50', '51+'] as const;
export const DECIDER_ANSWERS = ['yes', 'shared', 'no'] as const;
export const HOURS_ANSWERS = ['under-5', '5-20', '20-50', 'over-50', 'unsure'] as const;
export const START_ANSWERS = ['this-month', '1-3-months', 'later', 'exploring'] as const;
export const BUDGET_ANSWERS = ['under-2500', '2500-10000', '10000-30000', 'over-30000', 'unsure'] as const;

export type CompanySize = (typeof COMPANY_SIZES)[number];
export type Verdict = 'green' | 'amber' | 'red';

export interface FitInput {
  size: CompanySize;
  decider: (typeof DECIDER_ANSWERS)[number];
  /** Where the most time or money goes: up to two areas, comma separated. */
  pain: string;
  /** The prospect's own words about the problem. */
  problem: string;
  hours?: (typeof HOURS_ANSWERS)[number];
  start: (typeof START_ANSWERS)[number];
  budget?: (typeof BUDGET_ANSWERS)[number];
  erp?: string;
}

export interface FitResult {
  verdict: Verdict;
  /** True when the company is bigger than we target. It is still shown to a person. */
  outOfScope: boolean;
  /** Short, plain reasons in the order they matter, for the top of the email. */
  reasons: string[];
}

/** A problem described in fewer characters than this reads as vague ("we want AI"). */
export const SPECIFIC_PROBLEM_MIN_CHARS = 25;
/** Large ERPs whose integration usually needs extra scoping on the call. */
const HEAVY_ERP = /\b(sap|netsuite|oracle|dynamics)\b/i;

const SIZE_LABEL: Record<CompanySize, string> = {
  '1-5': '1 to 5 people',
  '6-15': '6 to 15 people',
  '16-30': '16 to 30 people',
  '31-50': '31 to 50 people',
  '51+': 'more than 50 people',
};

export function assessFit(input: FitInput): FitResult {
  const reasons: string[] = [];
  const problem = (input.problem ?? '').trim();
  const painAreas = (input.pain ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const specific = problem.length >= SPECIFIC_PROBLEM_MIN_CHARS;
  const focused = specific && painAreas.length === 1;

  const outOfScope = input.size === '51+';
  let red = false;
  let amber = false;

  // Size: the hard line of the target market.
  if (outOfScope) {
    reasons.push(`Size: ${SIZE_LABEL[input.size]}, above our target of 50.`);
    if (focused) amber = true;
    else red = true;
  } else if (input.size === '1-5') {
    reasons.push(`Size: ${SIZE_LABEL[input.size]}, very small.`);
    amber = true;
  } else {
    reasons.push(`Size: ${SIZE_LABEL[input.size]}, in scope.`);
  }

  // Decision.
  if (input.decider === 'no') {
    reasons.push('Decision: not the decision-maker, gathering information.');
    amber = true;
  } else {
    reasons.push(input.decider === 'yes' ? 'Decision: decides on projects like this.' : 'Decision: decides together with others.');
  }

  // The problem.
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

  if (input.budget === 'under-2500') {
    reasons.push('Budget: under 2,500 USD, below the audit price.');
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

  if (input.erp && HEAVY_ERP.test(input.erp)) {
    reasons.push(`Systems: ${input.erp.trim()}, needs integration scoping.`);
    amber = true;
  }

  if (bad >= 2) red = true;
  else if (bad === 1) amber = true;

  const verdict: Verdict = red ? 'red' : amber ? 'amber' : 'green';
  return { verdict, outOfScope, reasons };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  green: 'GREEN: a good fit. Send Form 2 and offer a call.',
  amber: 'AMBER: unclear. Call first.',
  red: 'RED: not a fit now. Reply politely.',
};
