import { describe, expect, it } from 'vitest';
import { assessFit, type FitInput } from '../../apps/gateway/src/services/leads/fit-check.js';

const good: FitInput = {
  size: '16-30',
  decider: 'yes',
  pain: 'Quotes and invoices',
  problem: 'Our invoices are typed by hand from emails and it takes two days every month.',
  hours: '20-50',
  start: '1-3-months',
  budget: '2500-10000',
  erp: 'Odoo',
};

describe('assessFit', () => {
  it('is green for a company of the right size with a specific problem, a decision-maker, time lost, a budget and a start date', () => {
    const r = assessFit(good);
    expect(r.verdict).toBe('green');
    expect(r.outOfScope).toBe(false);
    expect(r.reasons[0]).toBe('Size: 16 to 30 people, in scope.');
  });

  it('is red for a company over 50 people with no clear single problem, and says it is out of scope', () => {
    const r = assessFit({ ...good, size: '51+', pain: 'Quotes and invoices, Reports and admin', problem: 'We want AI.' });
    expect(r.verdict).toBe('red');
    expect(r.outOfScope).toBe(true);
    expect(r.reasons[0]).toContain('above our target of 50');
  });

  it('is only amber for a company over 50 people with one focused, specific problem', () => {
    const r = assessFit({ ...good, size: '51+' });
    expect(r.verdict).toBe('amber');
    expect(r.outOfScope).toBe(true);
  });

  it('is amber, not green, for a very small company, a person who is only gathering information, or a vague problem', () => {
    expect(assessFit({ ...good, size: '1-5' }).verdict).toBe('amber');
    expect(assessFit({ ...good, decider: 'no' }).verdict).toBe('amber');
    expect(assessFit({ ...good, problem: 'We want AI' }).verdict).toBe('amber');
  });

  it('is amber when the budget or the time lost is not stated, or the timing is later', () => {
    expect(assessFit({ ...good, budget: 'unsure' }).verdict).toBe('amber');
    expect(assessFit({ ...good, budget: undefined }).verdict).toBe('amber');
    expect(assessFit({ ...good, hours: 'unsure' }).verdict).toBe('amber');
    expect(assessFit({ ...good, start: 'later' }).verdict).toBe('amber');
  });

  it('turns red only when two bad signals stack up (below the audit price, under 5 hours, just exploring), and one alone is amber', () => {
    expect(assessFit({ ...good, budget: 'under-2500' }).verdict).toBe('amber');
    expect(assessFit({ ...good, budget: 'under-2500', start: 'exploring' }).verdict).toBe('red');
    expect(assessFit({ ...good, hours: 'under-5', start: 'exploring' }).verdict).toBe('red');
  });

  it('flags a large ERP for integration scoping without rejecting the request', () => {
    const r = assessFit({ ...good, erp: 'SAP Business One' });
    expect(r.verdict).toBe('amber');
    expect(r.reasons.join(' ')).toContain('needs integration scoping');
  });

  it('never says green when any reason is unfavourable', () => {
    for (const patch of [{ size: '1-5' as const }, { decider: 'no' as const }, { start: 'later' as const }, { budget: 'unsure' as const }]) {
      expect(assessFit({ ...good, ...patch }).verdict).not.toBe('green');
    }
  });
});
