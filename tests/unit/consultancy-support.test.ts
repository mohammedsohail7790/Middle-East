import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));
vi.mock('stripe', () => ({ default: class { webhooks = { constructEvent: (b: Buffer) => JSON.parse(b.toString()) }; } }));

const S = '../../apps/gateway/src/services/consultancy/';
const PLAN = '11111111-1111-4111-8111-111111111111';
const LEAD = '22222222-2222-4222-8222-222222222222';
const HOUR = '33333333-3333-4333-8333-333333333333';

type Q = { sql: string; params: any[] };
/** A fake pool: answers each query by matching its SQL text, and records every call. */
function fakePool(handler: (sql: string, params: any[]) => any) {
  const calls: Q[] = [];
  return { calls, query: vi.fn(async (sql: string, params: any[] = []) => { calls.push({ sql, params }); return handler(sql, params) ?? { rows: [], rowCount: 0 }; }) };
}
const planRow = (o: any = {}) => ({ id: PLAN, lead_id: LEAD, project_id: null, kind: 'standard', currency: 'AED', price_minor: '75000', hours_included: '4.00', status: 'pending', stripe_checkout_session_id: null, stripe_subscription_id: null, started_on: null, cancelled_at: null, created_at: 'x', updated_at: 'x', company: 'Acme', contact_name: 'Sam', email: 'sam@acme.test', ...o });

describe('plan terms', () => {
  it('uses the fixed defaults for standard and extended', async () => {
    const { resolveTerms } = await import(S + 'support-store.js');
    expect(resolveTerms({ kind: 'standard' })).toEqual({ kind: 'standard', priceMinor: 75000, hours: 4 });
    expect(resolveTerms({ kind: 'extended' })).toEqual({ kind: 'extended', priceMinor: 100000, hours: 6 });
  });
  it('needs a team price of at least AED 5,000 for partner and training, and hours for partner', async () => {
    const { resolveTerms } = await import(S + 'support-store.js');
    expect(() => resolveTerms({ kind: 'partner', priceMinor: 499999, hoursIncluded: 10 })).toThrow(/at least AED 5,000/);
    expect(() => resolveTerms({ kind: 'partner', priceMinor: 500000 })).toThrow(/hours/);
    expect(() => resolveTerms({ kind: 'training' })).toThrow(/at least/);
    expect(() => resolveTerms({ kind: 'training', priceMinor: 5000.5 })).toThrow();
    expect(resolveTerms({ kind: 'partner', priceMinor: 600000, hoursIncluded: 10 })).toEqual({ kind: 'partner', priceMinor: 600000, hours: 10 });
    expect(resolveTerms({ kind: 'training', priceMinor: 500000 })).toEqual({ kind: 'training', priceMinor: 500000, hours: 0 });
    expect(() => resolveTerms({ kind: 'gold' })).toThrow();
  });
  it('takes the currency from the lead audit, else AED, and stores parameterized values', async () => {
    const { createPlan } = await import(S + 'support-store.js');
    for (const [cur, want] of [['SAR', 'SAR'], [null, 'AED']] as const) {
      const pool = fakePool((sql) => {
        if (sql.includes('FROM public.consultancy_leads l LEFT JOIN public.audit_reports')) return { rows: [{ id: LEAD, currency: cur }] };
        if (sql.startsWith('INSERT')) return { rows: [{ id: PLAN }] };
        if (sql.includes('WHERE p.id')) return { rows: [planRow()] };
      });
      await createPlan(pool, { leadId: LEAD, kind: 'extended' });
      const ins = pool.calls.find((c) => c.sql.startsWith('INSERT'))!;
      expect(ins.params).toEqual([LEAD, null, 'extended', want, 100000, 6]);
      expect(ins.sql).not.toContain('100000');
    }
  });
  it('404s for an unknown lead', async () => {
    const { createPlan } = await import(S + 'support-store.js');
    await expect(createPlan(fakePool(() => ({ rows: [] })), { leadId: LEAD, kind: 'standard' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('usage and hours', () => {
  it('works out the Dubai month across the boundary (UTC evening is already tomorrow in Dubai)', async () => {
    const { dubaiMonth, dubaiDate, monthBounds, recentMonths } = await import(S + 'support-store.js');
    expect(dubaiMonth(new Date('2026-11-30T19:59:00Z'))).toBe('2026-11');
    expect(dubaiMonth(new Date('2026-11-30T20:00:00Z'))).toBe('2026-12');
    expect(dubaiDate(new Date('2026-12-31T21:00:00Z'))).toBe('2027-01-01');
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
    expect(recentMonths(new Date('2027-01-01T00:00:00Z'), 2)).toEqual(['2027-01', '2026-12', '2026-11']);
    expect(() => monthBounds('2026-13')).toThrow();
  });
  it('sums only the months rows in range, exactly, with percent and the over flag', async () => {
    const { usageFor } = await import(S + 'support-store.js');
    const mk = (used: string) => fakePool((sql) => sql.includes('SUM(hours)') ? { rows: [{ used }] } : { rows: [planRow()] });
    expect(await usageFor(mk('3.30'), PLAN, '2026-11')).toEqual({ month: '2026-11', usedHours: 3.3, includedHours: 4, percent: 83, over: false });
    expect((await usageFor(mk('4.00'), PLAN, '2026-11')).over).toBe(false);
    expect(await usageFor(mk('4.25'), PLAN, '2026-11')).toMatchObject({ over: true, percent: 106 });
    const pool = mk('1');
    await usageFor(pool, PLAN, '2026-12');
    expect(pool.calls.find((c) => c.sql.includes('SUM'))!.params).toEqual([PLAN, '2026-12-01', '2027-01-01']);
  });
  it('validates hours: more than 0, at most 24, two decimals, a real non-future date', async () => {
    const { logHours } = await import(S + 'support-store.js');
    const pool = fakePool(() => ({ rows: [planRow()] }));
    const now = new Date('2026-11-15T10:00:00Z');
    for (const bad of [0, -1, 24.5, NaN, '2', 1.234]) await expect(logHours(pool, PLAN, { hours: bad }, now)).rejects.toThrow();
    await expect(logHours(pool, PLAN, { hours: 1, workedOn: '2026-11-16' }, now)).rejects.toThrow(/future/);
    await expect(logHours(pool, PLAN, { hours: 1, workedOn: '2026-02-30' }, now)).rejects.toThrow(/date/);
    expect(pool.calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
  });
  const logPool = (before: string, status = 'active') => fakePool((sql, p) => {
    if (sql.includes('SUM(hours)')) return { rows: [{ used: before }] };
    if (sql.startsWith('INSERT')) return { rows: [{ id: HOUR, support_plan_id: PLAN, worked_on: p[1], hours: String(p[2]), note: p[3], logged_by: p[4], created_at: 'x' }] };
    if (sql.includes('WHERE p.id')) return { rows: [planRow({ status })] };
  });
  it('reports a crossing only for the entry that makes it', async () => {
    const { logHours } = await import(S + 'support-store.js');
    const now = new Date('2026-11-15T10:00:00Z');
    expect((await logHours(logPool('2.00'), PLAN, { hours: 1.2 }, now)).crossed).toEqual([80]);
    expect((await logHours(logPool('3.20'), PLAN, { hours: 0.5 }, now)).crossed).toEqual([]);
    expect((await logHours(logPool('3.20'), PLAN, { hours: 1 }, now)).crossed).toEqual([100]);
    const both = await logHours(logPool('1.00'), PLAN, { hours: 3.5 }, now);
    expect(both.crossed).toEqual([80, 100]);
    expect(both.usage.over).toBe(true);
    // a back-dated entry in an earlier month never alerts
    expect((await logHours(logPool('0'), PLAN, { hours: 5, workedOn: '2026-10-31' }, now)).crossed).toEqual([]);
  });
  it('refuses hours on a cancelled plan', async () => {
    const { logHours } = await import(S + 'support-store.js');
    await expect(logHours(logPool('0', 'cancelled'), PLAN, { hours: 1 }, new Date())).rejects.toMatchObject({ status: 409 });
  });
});

describe('checkout session', () => {
  beforeEach(() => { delete process.env.AUDIT_TAX_RATE_ID; });
  it('builds a monthly subscription with inline price_data and the plan in metadata', async () => {
    const { checkoutParams } = await import(S + 'support-checkout.js');
    const p: any = checkoutParams({ ...planRow(), price_minor: 75000, hours_included: 4 } as any, 1000);
    expect(p.mode).toBe('subscription');
    expect(p.line_items[0].price_data).toMatchObject({ currency: 'aed', unit_amount: 75000, recurring: { interval: 'month' } });
    expect(p.metadata).toEqual({ kind: 'support_plan', planId: PLAN });
    expect(p.subscription_data.metadata).toEqual({ kind: 'support_plan', planId: PLAN });
    expect(p.success_url).toMatch(/^https?:\/\//);
    expect(p.expires_at).toBe(1000 + 86400);
    expect(p.customer_email).toBe('sam@acme.test');
  });
  it('uses one-time payment mode for training and x10 for three-decimal currencies', async () => {
    const { checkoutParams } = await import(S + 'support-checkout.js');
    const t: any = checkoutParams(planRow({ kind: 'training', price_minor: 500000 }) as any);
    expect(t.mode).toBe('payment');
    expect(t.line_items[0].price_data.recurring).toBeUndefined();
    expect(t.payment_intent_data.metadata.planId).toBe(PLAN);
    const k: any = checkoutParams(planRow({ currency: 'KWD', price_minor: 25000 }) as any);
    expect(k.line_items[0].price_data.unit_amount).toBe(250000);
  });
  it('reuses an open session and creates a new one when it is expired', async () => {
    const { ensureCheckoutSession } = await import(S + 'support-checkout.js');
    const create = vi.fn().mockResolvedValue({ id: 'cs_new', url: 'https://stripe.test/new' });
    const retrieve = vi.fn().mockResolvedValue({ id: 'cs_old', status: 'open', url: 'https://stripe.test/old' });
    const stripe: any = { checkout: { sessions: { create, retrieve } } };
    const plan: any = planRow({ stripe_checkout_session_id: 'cs_old' });
    expect(await ensureCheckoutSession(stripe, plan)).toEqual({ url: 'https://stripe.test/old', sessionId: 'cs_old', reused: true });
    expect(create).not.toHaveBeenCalled();
    retrieve.mockResolvedValue({ id: 'cs_old', status: 'expired', url: null });
    expect((await ensureCheckoutSession(stripe, plan)).reused).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('team API', () => {
  let server: Server;
  let base: string;
  let plan: any;
  let pool: ReturnType<typeof fakePool>;
  const stripe = { checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } }, subscriptions: { update: vi.fn() } };
  const sendPaymentLink = vi.fn();
  const sendAlert = vi.fn();
  beforeEach(async () => {
    plan = planRow();
    stripe.checkout.sessions.create.mockReset().mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/pay' });
    stripe.checkout.sessions.retrieve.mockReset();
    stripe.subscriptions.update.mockReset().mockResolvedValue({});
    sendPaymentLink.mockReset().mockResolvedValue('sent');
    sendAlert.mockReset().mockResolvedValue(undefined);
    pool = fakePool((sql, p) => {
      if (sql.includes('SUM(hours)')) return { rows: [{ used: '3.00' }] };
      if (sql.startsWith('INSERT INTO public.consultancy_support_hours')) return { rows: [{ id: HOUR, support_plan_id: PLAN, worked_on: p[1], hours: String(p[2]), note: p[3], logged_by: p[4], created_at: 'x' }] };
      if (sql.includes('WHERE p.id')) return { rows: [plan] };
      if (sql.includes('FROM public.consultancy_support_plans p')) return { rows: [plan] };
      if (sql.startsWith('DELETE')) return { rowCount: p[0] === HOUR ? 1 : 0, rows: [] };
      if (sql.startsWith('UPDATE public.consultancy_support_plans') && sql.includes('RETURNING')) return { rows: [{ id: PLAN }] };
    });
    const { createSupportRouter } = await import(S + 'consultancy-support.router.js');
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => { req.consultancyAdminEmail = 'team@halla.test'; next(); });
    app.use('/s', createSupportRouter({ pool, stripe: () => stripe, sendPaymentLink, sendAlert, now: () => new Date('2026-11-15T10:00:00Z') }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/s`;
  });
  afterEach(async () => { await new Promise((r) => server.close(r)); });
  const post = (path: string, body: unknown = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('lists plans with this month usage', async () => {
    const j = await (await fetch(base + '/')).json();
    expect(j.data[0].usage).toMatchObject({ month: '2026-11', usedHours: 3, includedHours: 4, percent: 75, over: false });
  });
  it('returns six months of usage and the entries on GET /:id', async () => {
    const j = await (await fetch(`${base}/${PLAN}`)).json();
    expect(j.data.usage).toHaveLength(6);
    expect(j.data.usage[1].month).toBe('2026-10');
  });
  it('rejects a bad create and 404s a bad id', async () => {
    expect((await post('/', { kind: 'standard' })).status).toBe(400);
    expect((await post('/', { leadId: LEAD, kind: 'partner', priceMinor: 100 })).status).toBe(400);
    expect((await fetch(`${base}/not-an-id`)).status).toBe(404);
  });
  it('logs hours with the team email and alerts when 80% is crossed', async () => {
    const res = await post(`/${PLAN}/hours`, { hours: 0.5, note: 'fix' });
    expect(res.status).toBe(201);
    const ins = pool.calls.find((c) => c.sql.startsWith('INSERT INTO public.consultancy_support_hours'))!;
    expect(ins.params[4]).toBe('team@halla.test');
    expect(sendAlert).toHaveBeenCalledTimes(1); // 3.00 -> 3.50 crosses 80% (3.2 of 4) but not 100%
    expect(sendAlert.mock.calls[0][2]).toBe(80);
    const res2 = await post(`/${PLAN}/hours`, { hours: 25 });
    expect(res2.status).toBe(400);
  });
  it('sends the 100% alert when the entry reaches the full amount', async () => {
    await post(`/${PLAN}/hours`, { hours: 1 });
    expect(sendAlert.mock.calls.map((c) => c[2])).toEqual([80, 100]); // 3.00 -> 4.00 crosses both lines in one entry
  });
  it('still saves the hours when the alert email fails', async () => {
    sendAlert.mockRejectedValue(new Error('mail down'));
    expect((await post(`/${PLAN}/hours`, { hours: 1 })).status).toBe(201);
  });
  it('deletes a mistaken entry, 404 for one that is not on the plan', async () => {
    expect((await fetch(`${base}/${PLAN}/hours/${HOUR}`, { method: 'DELETE' })).status).toBe(200);
    expect((await fetch(`${base}/${PLAN}/hours/44444444-4444-4444-8444-444444444444`, { method: 'DELETE' })).status).toBe(404);
  });
  it('creates a checkout session, stores its id, emails the client and returns the link', async () => {
    const j = await (await post(`/${PLAN}/checkout`)).json();
    expect(j.data).toEqual({ url: 'https://stripe.test/pay', reused: false, emailed: 'sent' });
    expect(stripe.checkout.sessions.create.mock.calls[0][0].metadata).toEqual({ kind: 'support_plan', planId: PLAN });
    expect(pool.calls.some((c) => c.sql.includes('stripe_checkout_session_id = $2') && c.params[1] === 'cs_1')).toBe(true);
    expect(sendPaymentLink).toHaveBeenCalledWith(expect.anything(), 'https://stripe.test/pay');
  });
  it('reuses an open session without a second email, and tells the team', async () => {
    plan = planRow({ stripe_checkout_session_id: 'cs_old' });
    stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_old', status: 'open', url: 'https://stripe.test/old' });
    const j = await (await post(`/${PLAN}/checkout`)).json();
    expect(j.data).toEqual({ url: 'https://stripe.test/old', reused: true, emailed: 'skipped' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(sendPaymentLink).not.toHaveBeenCalled();
    const again = await (await post(`/${PLAN}/checkout`, { resend: true })).json();
    expect(again.data.emailed).toBe('sent');
  });
  it('refuses a payment link for a plan that is not pending', async () => {
    plan = planRow({ status: 'active' });
    expect((await post(`/${PLAN}/checkout`)).status).toBe(409);
  });
  it('cancels at period end when a subscription exists, otherwise straight away', async () => {
    plan = planRow({ status: 'active', stripe_subscription_id: 'sub_1' });
    const j = await (await post(`/${PLAN}/cancel`)).json();
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
    expect(j.data.cancelsAtPeriodEnd).toBe(true);
    plan = planRow();
    const k = await (await post(`/${PLAN}/cancel`)).json();
    expect(k.data.cancelsAtPeriodEnd).toBe(false);
    expect(pool.calls.some((c) => c.sql.includes('UPDATE public.consultancy_support_plans') && c.params[1] === 'cancelled')).toBe(true);
  });
});

describe('Stripe webhook for support plans', () => {
  const ev = (type: string, object: any) => ({ id: 'evt_1', type, data: { object } }) as any;
  const make = (initial: any) => {
    let row = initial ? { ...initial } : null;
    const pool = fakePool((sql, p) => {
      if (sql.includes('WHERE p.stripe_subscription_id')) return { rows: row && row.stripe_subscription_id === p[0] ? [row] : [] };
      if (sql.includes('WHERE p.id')) return { rows: row && row.id === p[0] ? [row] : [] };
      if (sql.startsWith('UPDATE public.consultancy_support_plans')) {
        row = { ...row, status: p[1], stripe_subscription_id: p[2] ?? row.stripe_subscription_id };
        return { rows: [{ id: row.id }] };
      }
    });
    const pastDueMail = vi.fn().mockResolvedValue(undefined);
    return { pool, pastDueMail, row: () => row };
  };
  const completed = (o: any = {}) => ev('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', subscription: 'sub_1', metadata: { kind: 'support_plan', planId: PLAN }, ...o });

  it('activates the plan on checkout.session.completed, once, even if replayed', async () => {
    const { handleSupportEvent } = await import(S + 'support-webhook.js');
    const d = make(planRow());
    expect(await handleSupportEvent(completed(), d)).toBe('handled');
    expect(d.row().status).toBe('active');
    expect(d.row().stripe_subscription_id).toBe('sub_1');
    const updates = () => d.pool.calls.filter((c) => c.sql.startsWith('UPDATE')).length;
    expect(updates()).toBe(1);
    await handleSupportEvent(completed(), d); // replay
    expect(updates()).toBe(1);
  });
  it('does not reactivate a cancelled plan on a replayed event', async () => {
    const { handleSupportEvent } = await import(S + 'support-webhook.js');
    const d = make(planRow({ status: 'cancelled' }));
    await handleSupportEvent(completed(), d);
    expect(d.row().status).toBe('cancelled');
  });
  it('ignores unknown plans, unpaid sessions and other kinds', async () => {
    const { handleSupportEvent } = await import(S + 'support-webhook.js');
    const d = make(null);
    expect(await handleSupportEvent(completed(), d)).toBe('ignored');
    expect(await handleSupportEvent(ev('invoice.payment_failed', { subscription: 'sub_x' }), d)).toBe('ignored');
    expect(await handleSupportEvent(ev('customer.subscription.deleted', { id: 'sub_x' }), d)).toBe('ignored');
    const d2 = make(planRow());
    expect(await handleSupportEvent(completed({ payment_status: 'unpaid' }), d2)).toBe('ignored');
    expect(await handleSupportEvent(completed({ metadata: { kind: 'audit', link_id: 'a' } }), d2)).toBe('ignored');
    expect(d2.row().status).toBe('pending');
  });
  it('marks past_due and emails the team once, then clears on invoice.paid', async () => {
    const { handleSupportEvent } = await import(S + 'support-webhook.js');
    const d = make(planRow({ status: 'active', stripe_subscription_id: 'sub_1' }));
    const failed = ev('invoice.payment_failed', { subscription: 'sub_1' });
    await handleSupportEvent(failed, d);
    expect(d.row().status).toBe('past_due');
    expect(d.pastDueMail).toHaveBeenCalledTimes(1);
    await handleSupportEvent(failed, d); // Stripe retry or replay
    expect(d.pastDueMail).toHaveBeenCalledTimes(1);
    await handleSupportEvent(ev('invoice.paid', { parent: { subscription_details: { subscription: 'sub_1' } } }), d);
    expect(d.row().status).toBe('active');
  });
  it('marks cancelled on customer.subscription.deleted', async () => {
    const { handleSupportEvent } = await import(S + 'support-webhook.js');
    const d = make(planRow({ status: 'active', stripe_subscription_id: 'sub_1' }));
    await handleSupportEvent(ev('customer.subscription.deleted', { id: 'sub_1' }), d);
    expect(d.row().status).toBe('cancelled');
  });
  it('ignores events it does not care about without touching the database', async () => {
    const { handleSupportEvent } = await import(S + 'support-webhook.js');
    const d = make(planRow());
    expect(await handleSupportEvent(ev('charge.refunded', {}), d)).toBe('ignored');
    expect(d.pool.calls).toHaveLength(0);
  });
});

describe('through the real webhook handler', () => {
  let server: Server;
  let base: string;
  const handle = vi.fn();
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock(S + 'support-webhook.js', () => ({ handleSupportEvent: handle }));
    handle.mockReset().mockResolvedValue('handled');
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.AUDIT_STRIPE_WEBHOOK_SECRET = 'whsec_x';
    const { handleAuditStripeWebhook } = await import('../../apps/gateway/src/services/audit/public-audit.controller.js');
    const app = express();
    app.post('/hook', express.raw({ type: 'application/json' }), (req, res) => void handleAuditStripeWebhook(req, res));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  });
  afterEach(async () => { await new Promise((r) => server.close(r)); vi.doUnmock(S + 'support-webhook.js'); });
  it('passes the event on after the signature check and answers 500 if recording fails', async () => {
    const body = JSON.stringify({ id: 'e', type: 'invoice.paid', data: { object: {} } });
    const h = { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=x' };
    expect((await fetch(base, { method: 'POST', headers: h, body })).status).toBe(200);
    expect(handle).toHaveBeenCalledTimes(1);
    handle.mockRejectedValue(new Error('db down'));
    expect((await fetch(base, { method: 'POST', headers: h, body })).status).toBe(500);
    // no signature: refused before the support code runs
    handle.mockClear();
    expect((await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });
});
