import { describe, expect, it } from 'vitest';
import { assessFit, QUOTE_CURRENCY, COUNTRIES, type FitInput } from '../../apps/gateway/src/services/leads/fit-check.js';

const good: FitInput = {
  size: '16-50',
  office: '6-15',
  decider: 'yes',
  pain: 'Quotes and invoices',
  problem: 'Our invoices are typed by hand from emails and it takes two days every month.',
  departments: 'Sales, Finance and accounts, Warehouse or logistics',
  hours: '20-50',
  start: '1-3-months',
  budget: '5000-10000',
  erp: 'Odoo',
};

describe('assessFit', () => {
  it('is green for a company with a specific problem, a decision-maker, time lost, a budget above the audit price and a start date', () => {
    const r = assessFit(good);
    expect(r.verdict).toBe('green');
    expect(r.reasons[0]).toBe('Size: 16 to 50 people, 6-15 of them in the office or deciding.');
  });

  it('never rejects a company for its total size: 30 warehouse staff in a company of 120 is judged on the office, the ERP and the departments', () => {
    const r = assessFit({ ...good, size: '51-150', office: '6-15' });
    expect(r.verdict).toBe('green');
    expect(r.reasons.join(' ')).not.toContain('Large office');
  });

  it('treats a very large company as amber, never red on size alone', () => {
    expect(assessFit({ ...good, size: '150+', office: undefined }).verdict).toBe('amber');
    expect(assessFit({ ...good, size: '150+', office: '51+' }).verdict).toBe('amber');
    expect(assessFit({ ...good, size: '150+', office: undefined }).reasons.join(' ')).toContain('Large office');
  });

  it('is amber for a very small team, a person only gathering information, a vague problem, or many departments', () => {
    expect(assessFit({ ...good, size: '1-5', office: '1-5' }).verdict).toBe('amber');
    expect(assessFit({ ...good, decider: 'no' }).verdict).toBe('amber');
    expect(assessFit({ ...good, problem: 'We want AI' }).verdict).toBe('amber');
    const many = 'Sales, Operations, Finance and accounts, Warehouse or logistics, Procurement, HR';
    const r = assessFit({ ...good, departments: many });
    expect(r.verdict).toBe('amber');
    expect(r.reasons.join(' ')).toContain('Many departments');
  });

  it('is amber when the budget or the time lost is not stated, or the timing is later', () => {
    expect(assessFit({ ...good, budget: 'unsure' }).verdict).toBe('amber');
    expect(assessFit({ ...good, budget: undefined }).verdict).toBe('amber');
    expect(assessFit({ ...good, hours: 'unsure' }).verdict).toBe('amber');
    expect(assessFit({ ...good, start: 'later' }).verdict).toBe('amber');
  });

  it('checks the budget against the 5,000 USD audit: below it is a bad signal, and two bad signals together are red', () => {
    const below = assessFit({ ...good, budget: 'under-5000' });
    expect(below.verdict).toBe('amber');
    expect(below.reasons.join(' ')).toContain('below the audit price');
    expect(assessFit({ ...good, budget: 'under-5000', start: 'exploring' }).verdict).toBe('red');
    expect(assessFit({ ...good, hours: 'under-5', start: 'exploring' }).verdict).toBe('red');
  });

  it('notes the ERP and flags a large one for integration scoping without rejecting the request', () => {
    expect(assessFit(good).reasons).toContain('ERP: Odoo.');
    const r = assessFit({ ...good, erp: 'SAP Business One' });
    expect(r.verdict).toBe('amber');
    expect(r.reasons.join(' ')).toContain('needs integration scoping');
    expect(assessFit({ ...good, erp: 'None' }).reasons).toContain('ERP: none.');
  });

  it('judges a company that ticks several areas on its other answers', () => {
    expect(assessFit({ ...good, pain: 'Quotes and invoices, Scheduling, Reports and admin' }).verdict).toBe('green');
  });

  it('never says green when any reason is unfavourable', () => {
    for (const patch of [{ size: '1-5' as const, office: undefined }, { decider: 'no' as const }, { start: 'later' as const }, { budget: 'unsure' as const }]) {
      expect(assessFit({ ...good, ...patch }).verdict).not.toBe('green');
    }
  });
});

describe('quote currency', () => {
  it('has a currency for every GCC country we ask about, and quotes anything else in US dollars', () => {
    expect(QUOTE_CURRENCY['United Arab Emirates']).toBe('AED');
    expect(QUOTE_CURRENCY['Saudi Arabia']).toBe('SAR');
    expect(QUOTE_CURRENCY.Other).toBe('USD');
    for (const c of COUNTRIES) expect(QUOTE_CURRENCY[c]).toMatch(/^[A-Z]{3}$/);
  });
});
