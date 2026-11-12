import { describe, expect, it } from 'vitest';
import { DEFAULT_RATES, estimateHours, estimateTimeline, quote, ratesFromEnv, splitWeeks, type Assessment } from '../../../apps/gateway/src/services/audit/audit-estimate.js';

const base: Assessment = { complexity: 'medium', volume: 'low', dataFormat: 'structured', systems: 'cloud', humanApproval: false, budgetMaxAed: null };
const a = (over: Partial<Assessment>): Assessment => ({ ...base, ...over });

describe('audit estimate: hours', () => {
  it('uses the base range for each tier', () => {
    expect(estimateHours(a({ complexity: 'low' }))).toMatchObject({ min: 15, max: 25 });
    expect(estimateHours(a({ complexity: 'medium' }))).toMatchObject({ min: 35, max: 60 });
    expect(estimateHours(a({ complexity: 'high' }))).toMatchObject({ min: 80, max: 150 });
  });

  it('adds 5 hours for high volume with structured data, 15-20 with messy data', () => {
    expect(estimateHours(a({ volume: 'high', dataFormat: 'structured' }))).toMatchObject({ min: 40, max: 65 });
    expect(estimateHours(a({ volume: 'high', dataFormat: 'messy' }))).toMatchObject({ min: 50, max: 80 });
  });

  it('adds nothing for volume when the data is mixed or the volume is low', () => {
    expect(estimateHours(a({ volume: 'high', dataFormat: 'mixed' })).adjustments).toHaveLength(0);
    expect(estimateHours(a({ volume: 'low', dataFormat: 'messy' })).adjustments).toHaveLength(0);
  });

  it('doubles the integration share for legacy systems (40% of the base hours again)', () => {
    expect(estimateHours(a({ systems: 'legacy' }))).toMatchObject({ min: 49, max: 84 });
  });

  it('adds 10-15 hours when a human must approve steps', () => {
    expect(estimateHours(a({ humanApproval: true }))).toMatchObject({ min: 45, max: 75 });
  });

  it('stacks the adjustments and lists each one', () => {
    const h = estimateHours(a({ complexity: 'high', volume: 'high', dataFormat: 'messy', systems: 'legacy', humanApproval: true }));
    expect(h.adjustments).toHaveLength(3);
    expect(h).toMatchObject({ min: 80 + 15 + 32 + 10, max: 150 + 20 + 60 + 15 });
  });
});

describe('audit estimate: fixed fee', () => {
  it('prices the top of the range at the blended rate (Hk: 60 hours at AED 400 = AED 24,000)', () => {
    expect(quote(a({ complexity: 'medium' })).feeAed).toBe(24000);
  });

  it('rounds up to the next AED 500', () => {
    // 25 hours * 400 = 10,000 (exact); 2 extra hours would give 10,800 -> 11,000
    expect(quote(a({ complexity: 'low' })).feeAed).toBe(10000);
    expect(quote(a({ complexity: 'low' }), { ...DEFAULT_RATES, blended: 432 }).feeAed).toBe(11000);
  });

  it('adds the optional buffer on top (10% turns 24,000 into 26,400, rounded to 26,500)', () => {
    expect(quote(a({}), { ...DEFAULT_RATES, bufferPct: 10 }).feeAed).toBe(26500);
  });

  it('flags a budget below the fee and offers a smaller Phase 1 that fits it', () => {
    const q = quote(a({ complexity: 'high', budgetMaxAed: 10000 }));
    expect(q.overBudget).toBe(true);
    expect(q.phase1Aed).toBe(10000);
    expect(q.feeAed).toBeGreaterThan(10000);
  });

  it('does not flag a budget that covers the fee, or an unknown budget', () => {
    expect(quote(a({ budgetMaxAed: 30000 })).overBudget).toBe(false);
    expect(quote(a({ budgetMaxAed: null })).overBudget).toBe(false);
    expect(quote(a({ budgetMaxAed: null })).phase1Aed).toBeNull();
  });
});

describe('audit estimate: rates from the environment', () => {
  it('falls back to the defaults and ignores bad values', () => {
    expect(ratesFromEnv({})).toEqual(DEFAULT_RATES);
    expect(ratesFromEnv({ AUDIT_RATE_BLENDED_AED: 'abc', AUDIT_PRICE_BUFFER_PCT: '-5' } as any)).toEqual(DEFAULT_RATES);
  });

  it('reads overrides', () => {
    expect(ratesFromEnv({ AUDIT_RATE_BLENDED_AED: '450', AUDIT_PRICE_BUFFER_PCT: '10' } as any)).toMatchObject({ blended: 450, bufferPct: 10 });
  });
});

describe('audit estimate: time frame', () => {
  it('turns the hours range into weeks at 25 build hours a week', () => {
    expect(estimateTimeline({ min: 35, max: 60 })).toMatchObject({ weeksMin: 2, weeksMax: 3 });
    expect(estimateTimeline({ min: 90, max: 165 })).toMatchObject({ weeksMin: 4, weeksMax: 7 });
    expect(estimateTimeline({ min: 15, max: 25 })).toMatchObject({ weeksMin: 1, weeksMax: 1 });
  });

  it('never gives a high end below the low end, and uses a different pace when told to', () => {
    const t = estimateTimeline({ min: 100, max: 100 }, 20);
    expect(t.weeksMin).toBe(5);
    expect(t.weeksMax).toBe(5);
    expect(estimateTimeline({ min: 80, max: 150 }, 30)).toMatchObject({ weeksMin: 3, weeksMax: 5 });
  });

  it('shares the weeks over three phases, at least a week each, adding up to the total', () => {
    expect(splitWeeks(10)).toEqual([2, 5, 3]);
    expect(splitWeeks(6)).toEqual([1, 3, 2]);
    expect(splitWeeks(1)).toEqual([1, 1, 1]);
    for (const total of [3, 4, 5, 7, 9, 12, 20]) {
      const parts = splitWeeks(total);
      expect(parts.every((n) => n >= 1)).toBe(true);
      expect(parts[0] + parts[1] + parts[2]).toBe(total);
    }
  });

  it('puts the timeline in the phase split of the estimate for a big job', () => {
    const t = estimateTimeline({ min: 137, max: 245 });
    expect(t.weeksMax).toBe(10);
    expect(t.phaseWeeks[0] + t.phaseWeeks[1] + t.phaseWeeks[2]).toBe(10);
  });

  it('reads the pace from the environment and ignores bad values', () => {
    expect(ratesFromEnv({ AUDIT_BUILD_HOURS_PER_WEEK: '40' } as any).hoursPerWeek).toBe(40);
    expect(ratesFromEnv({ AUDIT_BUILD_HOURS_PER_WEEK: 'lots' } as any).hoursPerWeek).toBe(25);
    expect(ratesFromEnv({ AUDIT_BUILD_HOURS_PER_WEEK: '0' } as any).hoursPerWeek).toBe(1);
  });
});
