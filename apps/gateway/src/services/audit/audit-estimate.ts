/**
 * The audit's price, worked out by code and never by the AI.
 *
 * The AI only reads the client's answers and fills in an Assessment (a few labelled facts). Everything after that is arithmetic, using the rules Hk sent on 12 November 2026:
 *  - a complexity tier sets the hours range (Low 15-25, Medium 35-60, High 80-150);
 *  - fixed adjustments add hours (scaling tests, messy data, legacy systems, a human approval screen);
 *  - the fixed fee is the TOP of the hours range times one blended hourly rate, plus an optional buffer;
 *  - the client sees only the fee and the phases, never hours or rates.
 * Rates and the buffer can be changed with environment variables, so a price change needs no code change.
 */

export type Complexity = 'low' | 'medium' | 'high';

export interface Assessment {
  complexity: Complexity;
  /** Items per month: 'high' means more than 5,000. */
  volume: 'low' | 'high' | 'unknown';
  /** How uniform the documents or inputs are. */
  dataFormat: 'structured' | 'mixed' | 'messy' | 'unknown';
  /** The client's software: cloud tools with APIs, a mix, or legacy / on-premise systems. */
  systems: 'cloud' | 'mixed' | 'legacy' | 'unknown';
  /** True when a person must review or approve steps, so an internal review screen is needed. */
  humanApproval: boolean;
  /** The top of the client's stated budget in AED, or null when they gave none or it cannot be read. */
  budgetMaxAed: number | null;
}

export interface Rates {
  tier1: number;
  tier2: number;
  tier3: number;
  /** The one rate used for the fixed fee. */
  blended: number;
  /** Extra percentage added on top of the top of the range (0 = none, 10 = ten percent). */
  bufferPct: number;
  /** The fee is rounded up to a multiple of this many AED. */
  roundTo: number;
  /** Productive build hours one engineer gets through in a week. Turns the hours estimate into a time frame. */
  hoursPerWeek: number;
}

export const DEFAULT_RATES: Rates = { tier1: 300, tier2: 475, tier3: 675, blended: 400, bufferPct: 0, roundTo: 500, hoursPerWeek: 30 };

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function ratesFromEnv(env: NodeJS.ProcessEnv = process.env): Rates {
  return {
    tier1: num(env.AUDIT_RATE_TIER1_AED, DEFAULT_RATES.tier1),
    tier2: num(env.AUDIT_RATE_TIER2_AED, DEFAULT_RATES.tier2),
    tier3: num(env.AUDIT_RATE_TIER3_AED, DEFAULT_RATES.tier3),
    blended: num(env.AUDIT_RATE_BLENDED_AED, DEFAULT_RATES.blended),
    bufferPct: num(env.AUDIT_PRICE_BUFFER_PCT, DEFAULT_RATES.bufferPct),
    roundTo: Math.max(1, num(env.AUDIT_PRICE_ROUND_TO_AED, DEFAULT_RATES.roundTo)),
    hoursPerWeek: Math.max(1, num(env.AUDIT_BUILD_HOURS_PER_WEEK, DEFAULT_RATES.hoursPerWeek)),
  };
}

const BASE_HOURS: Record<Complexity, [number, number]> = { low: [15, 25], medium: [35, 60], high: [80, 150] };

/** Part of the base hours that is integration work. Legacy systems double that part, so they add this share again. */
const INTEGRATION_SHARE = 0.4;

export interface HoursBreakdown {
  min: number;
  max: number;
  /** Each adjustment applied, for the team's review page. Never shown to the client. */
  adjustments: Array<{ reason: string; min: number; max: number }>;
}

export function estimateHours(a: Assessment): HoursBreakdown {
  const [bmin, bmax] = BASE_HOURS[a.complexity];
  const adjustments: HoursBreakdown['adjustments'] = [];
  const add = (reason: string, min: number, max: number) => adjustments.push({ reason, min, max });

  if (a.volume === 'high' && a.dataFormat === 'structured') add('High volume, structured data: scaling tests', 5, 5);
  if (a.volume === 'high' && a.dataFormat === 'messy') add('High volume, messy data: prompt engineering, fallbacks and exception screen', 15, 20);
  if (a.systems === 'legacy') add('Legacy or on-premise systems: integration work doubled', Math.round(bmin * INTEGRATION_SHARE), Math.round(bmax * INTEGRATION_SHARE));
  if (a.humanApproval) add('Human approval needed: review screen, alerts and retry logic', 10, 15);

  const min = bmin + adjustments.reduce((s, x) => s + x.min, 0);
  const max = bmax + adjustments.reduce((s, x) => s + x.max, 0);
  return { min, max, adjustments };
}

export interface Quote {
  hours: HoursBreakdown;
  /** The fixed fee in AED. */
  feeAed: number;
  /** True when the client's budget is below the fee, so the report should suggest a smaller Phase 1. */
  overBudget: boolean;
  /** A smaller first phase that fits the budget, in AED, when overBudget. */
  phase1Aed: number | null;
}

const roundUp = (value: number, step: number): number => Math.ceil(value / step) * step;

export function quote(a: Assessment, rates: Rates = DEFAULT_RATES): Quote {
  const hours = estimateHours(a);
  const feeAed = roundUp(hours.max * rates.blended * (1 + rates.bufferPct / 100), rates.roundTo);
  const budget = a.budgetMaxAed;
  const overBudget = budget !== null && budget > 0 && budget < feeAed;
  // Phase 1 is the largest round figure that fits inside the stated budget.
  const phase1Aed = overBudget && budget !== null ? Math.floor(budget / rates.roundTo) * rates.roundTo : null;
  return { hours, feeAed, overBudget, phase1Aed: phase1Aed && phase1Aed > 0 ? phase1Aed : null };
}

export interface Timeline {
  /** Calendar weeks from the start of the build, low and high. */
  weeksMin: number;
  weeksMax: number;
  /** About how long each of the three phases takes. They add up to weeksMax. */
  phaseWeeks: [number, number, number];
}

/** How the weeks are shared between Architecture and Discovery, Core Build, and Testing and Deployment. */
const PHASE_SHARE: [number, number, number] = [0.2, 0.5, 0.3];

/** Split a total number of weeks over the three phases, at least a week each, adding up to the total (or to three if the total is smaller). */
export function splitWeeks(totalWeeks: number): [number, number, number] {
  const total = Math.max(3, Math.round(totalWeeks));
  const first = Math.max(1, Math.round(total * PHASE_SHARE[0]));
  const last = Math.max(1, Math.round(total * PHASE_SHARE[2]));
  return [first, Math.max(1, total - first - last), last];
}

/** The time frame the client is shown, from the same hours the price comes from. */
export function estimateTimeline(hours: { min: number; max: number }, hoursPerWeek: number = DEFAULT_RATES.hoursPerWeek): Timeline {
  const weeksMin = Math.max(1, Math.ceil(hours.min / hoursPerWeek));
  const weeksMax = Math.max(weeksMin, Math.ceil(hours.max / hoursPerWeek));
  return { weeksMin, weeksMax, phaseWeeks: splitWeeks(weeksMax) };
}
