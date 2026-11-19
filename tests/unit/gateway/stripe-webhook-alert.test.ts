import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
  return { construct: vi.fn(), handle: vi.fn(), note: vi.fn() };
});

vi.mock('stripe', () => ({ default: class { webhooks = { constructEvent: h.construct }; } }));
vi.mock('../../../apps/gateway/src/services/billing/billing.service.js', () => ({ billingService: { handleWebhook: h.handle } }));
vi.mock('../../../apps/gateway/src/services/ops-alerts/team-alert.js', () => ({ noteStripeWebhookFailureForTeam: h.note }));

import { handleStripeBillingWebhook } from '../../../apps/gateway/src/services/billing/stripe-webhook.js';

const call = async () => {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handleStripeBillingWebhook({ headers: { 'stripe-signature': 'sig' }, body: Buffer.from('{}') } as any, res);
  return res;
};

beforeEach(() => {
  h.construct.mockReset();
  h.handle.mockReset();
  h.note.mockReset();
});

describe('Stripe billing webhook alerts', () => {
  it('answers 200 and tells nobody when the event is processed', async () => {
    h.construct.mockReturnValue({ id: 'evt_1', type: 'invoice.paid' });
    h.handle.mockResolvedValue(undefined);
    const res = await call();
    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(h.note).not.toHaveBeenCalled();
  });

  it('does not alert the team for a bad signature, which is just noise from outside', async () => {
    h.construct.mockImplementation(() => { throw new Error('No signatures found matching'); });
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Webhook signature verification failed' });
    expect(h.note).not.toHaveBeenCalled();
    expect(h.handle).not.toHaveBeenCalled();
  });

  it('alerts the team when a valid event fails to process, and still answers 400 so Stripe retries', async () => {
    h.construct.mockReturnValue({ id: 'evt_2', type: 'invoice.payment_failed' });
    h.handle.mockRejectedValue(new Error('db down'));
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Webhook processing failed' });
    expect(h.note).toHaveBeenCalledWith('invoice.payment_failed', 'evt_2', expect.any(Error));
  });
});
