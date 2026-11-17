import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the support plans table: only the state changes matter here.
type Plan = { id: string; status: string; stripe_subscription_id: string | null; started_on: string | null };
const plans = new Map<string, Plan>();
const setStatusCalls: Array<{ id: string; status: string; extra?: unknown }> = [];

vi.mock('../../apps/gateway/src/services/consultancy/support-store.js', () => ({
  getPlan: async (_pool: unknown, id: string) => plans.get(id) ?? null,
  getPlanBySubscription: async (_pool: unknown, subId: string) => [...plans.values()].find((p) => p.stripe_subscription_id === subId) ?? null,
  setStatus: async (_pool: unknown, id: string, status: string, extra?: { subscriptionId?: string; startedOn?: boolean }) => {
    setStatusCalls.push({ id, status, extra });
    const p = plans.get(id)!;
    p.status = status;
    if (extra?.subscriptionId) p.stripe_subscription_id = extra.subscriptionId;
    if (extra?.startedOn) p.started_on = p.started_on ?? '2026-11-17';
    return p;
  },
}));
vi.mock('../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../../apps/gateway/src/services/consultancy/support-mail.js', () => ({ sendPastDueAlert: async () => {} }));

import { handleSupportEvent, invoiceSubscriptionId } from '../../apps/gateway/src/services/consultancy/support-webhook.js';

const SUB = 'sub_test_123';
const pastDueMail = vi.fn(async () => {});
const run = (event: unknown) => handleSupportEvent(event as never, { pool: { query: vi.fn() } as never, pastDueMail });
const invoice = (type: string, sub: string | null = SUB, newShape = false) => ({
  type,
  data: { object: newShape ? { parent: { subscription_details: { subscription: sub } } } : { subscription: sub } },
});

beforeEach(() => {
  plans.clear();
  setStatusCalls.length = 0;
  pastDueMail.mockClear();
  pastDueMail.mockResolvedValue(undefined);
  plans.set('plan_1', { id: 'plan_1', status: 'active', stripe_subscription_id: SUB, started_on: '2026-11-01' });
});

describe('support plan webhook events', () => {
  it('invoice.payment_failed turns an active plan past_due and emails the team once', async () => {
    expect(await run(invoice('invoice.payment_failed'))).toBe('handled');
    expect(plans.get('plan_1')!.status).toBe('past_due');
    expect(pastDueMail).toHaveBeenCalledTimes(1);
    expect(pastDueMail.mock.calls[0][0]).toMatchObject({ id: 'plan_1', status: 'past_due' });
  });

  it('a replayed or retried payment_failed changes nothing and sends no second email', async () => {
    await run(invoice('invoice.payment_failed'));
    await run(invoice('invoice.payment_failed'));
    expect(setStatusCalls).toHaveLength(1);
    expect(pastDueMail).toHaveBeenCalledTimes(1);
  });

  it('a failed email still leaves the plan past_due and does not throw', async () => {
    pastDueMail.mockRejectedValue(new Error('mail down'));
    await expect(run(invoice('invoice.payment_failed'))).resolves.toBe('handled');
    expect(plans.get('plan_1')!.status).toBe('past_due');
  });

  it('invoice.paid clears past_due back to active, and does nothing to an active plan', async () => {
    plans.get('plan_1')!.status = 'past_due';
    expect(await run(invoice('invoice.paid'))).toBe('handled');
    expect(plans.get('plan_1')!.status).toBe('active');
    setStatusCalls.length = 0;
    await run(invoice('invoice.paid'));
    expect(setStatusCalls).toHaveLength(0);
  });

  it('payment_failed on a cancelled plan does not reopen it or email', async () => {
    plans.get('plan_1')!.status = 'cancelled';
    await run(invoice('invoice.payment_failed'));
    expect(plans.get('plan_1')!.status).toBe('cancelled');
    expect(pastDueMail).not.toHaveBeenCalled();
  });

  it('reads the subscription from the newer invoice shape too', async () => {
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: SUB } } })).toBe(SUB);
    expect(invoiceSubscriptionId({ subscription: { id: SUB } })).toBe(SUB);
    expect(invoiceSubscriptionId({})).toBeNull();
    await run(invoice('invoice.payment_failed', SUB, true));
    expect(plans.get('plan_1')!.status).toBe('past_due');
  });

  it('customer.subscription.deleted cancels the plan once', async () => {
    const ev = { type: 'customer.subscription.deleted', data: { object: { id: SUB } } };
    expect(await run(ev)).toBe('handled');
    expect(plans.get('plan_1')!.status).toBe('cancelled');
    setStatusCalls.length = 0;
    await run(ev);
    expect(setStatusCalls).toHaveLength(0);
  });

  it('events for a subscription we do not know are ignored', async () => {
    expect(await run(invoice('invoice.paid', 'sub_unknown'))).toBe('ignored');
    expect(await run(invoice('invoice.payment_failed', null))).toBe('ignored');
    expect(await run({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_unknown' } } })).toBe('ignored');
    expect(setStatusCalls).toHaveLength(0);
  });

  it('event types it does not care about are ignored', async () => {
    expect(await run({ type: 'customer.created', data: { object: {} } })).toBe('ignored');
    expect(await run({ type: 'invoice.created', data: { object: { subscription: SUB } } })).toBe('ignored');
  });

  it('checkout.session.completed for a paid support plan activates it and stores the subscription id', async () => {
    plans.set('plan_2', { id: 'plan_2', status: 'pending', stripe_subscription_id: null, started_on: null });
    const ev = { type: 'checkout.session.completed', data: { object: { metadata: { kind: 'support_plan', planId: 'plan_2' }, payment_status: 'paid', subscription: 'sub_new' } } };
    expect(await run(ev)).toBe('handled');
    expect(plans.get('plan_2')).toMatchObject({ status: 'active', stripe_subscription_id: 'sub_new' });
  });

  it('checkout.session.completed that is unpaid, or not for a support plan, changes nothing', async () => {
    plans.set('plan_2', { id: 'plan_2', status: 'pending', stripe_subscription_id: null, started_on: null });
    const unpaid = { type: 'checkout.session.completed', data: { object: { metadata: { kind: 'support_plan', planId: 'plan_2' }, payment_status: 'unpaid' } } };
    const audit = { type: 'checkout.session.completed', data: { object: { metadata: { kind: 'audit' }, payment_status: 'paid' } } };
    expect(await run(unpaid)).toBe('ignored');
    expect(await run(audit)).toBe('ignored');
    expect(plans.get('plan_2')!.status).toBe('pending');
  });
});
