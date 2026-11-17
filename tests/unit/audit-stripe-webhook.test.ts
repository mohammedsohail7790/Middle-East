import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleSupportEvent = vi.fn(async () => 'handled');
vi.mock('../../apps/gateway/src/services/consultancy/support-webhook.js', () => ({ handleSupportEvent: (...a: unknown[]) => handleSupportEvent(...(a as [])) }));

import { handleAuditStripeWebhook } from '../../apps/gateway/src/services/audit/public-audit.controller.js';

const SECRET = 'whsec_test_secret_for_unit_tests';
const stripe = new Stripe('sk_test_unit_tests_only');
const body = (type: string) => JSON.stringify({ id: 'evt_test_1', object: 'event', api_version: '2026-08-26.dahlia', type, data: { object: { id: 'in_test', subscription: 'sub_test_123' } } });
const signed = (payload: string, secret = SECRET) => ({
  headers: { 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret }) },
  body: Buffer.from(payload),
});
function res() {
  const r: { statusCode: number; json: unknown } = { statusCode: 200, json: undefined };
  const out = {
    status(code: number) { r.statusCode = code; return out; },
    json(v: unknown) { r.json = v; return out; },
  };
  return { out, r };
}

beforeEach(() => {
  handleSupportEvent.mockClear();
  handleSupportEvent.mockResolvedValue('handled');
  process.env.AUDIT_STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit_tests_only';
});

describe('audit / support Stripe webhook endpoint', () => {
  it.each(['invoice.paid', 'invoice.payment_failed', 'customer.subscription.deleted'])('accepts a correctly signed %s and passes it to the support handler', async (type) => {
    const { out, r } = res();
    await handleAuditStripeWebhook(signed(body(type)), out);
    expect(r.statusCode).toBe(200);
    expect(r.json).toEqual({ received: true });
    expect(handleSupportEvent).toHaveBeenCalledTimes(1);
    expect((handleSupportEvent.mock.calls[0] as unknown as [{ type: string }])[0].type).toBe(type);
  });

  it('rejects a payload signed with the wrong secret (400) and does not handle it', async () => {
    const { out, r } = res();
    await handleAuditStripeWebhook(signed(body('invoice.paid'), 'whsec_someone_else'), out);
    expect(r.statusCode).toBe(400);
    expect(handleSupportEvent).not.toHaveBeenCalled();
  });

  it('rejects a payload that was changed after signing', async () => {
    const good = signed(body('invoice.paid'));
    const { out, r } = res();
    await handleAuditStripeWebhook({ headers: good.headers, body: Buffer.from(body('invoice.payment_failed')) }, out);
    expect(r.statusCode).toBe(400);
    expect(handleSupportEvent).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header or a non-raw body (400)', async () => {
    const a = res();
    await handleAuditStripeWebhook({ headers: {}, body: Buffer.from(body('invoice.paid')) }, a.out);
    expect(a.r.statusCode).toBe(400);
    const b = res();
    await handleAuditStripeWebhook({ headers: signed(body('invoice.paid')).headers, body: { not: 'raw' } }, b.out);
    expect(b.r.statusCode).toBe(400);
  });

  it('answers 503 when the webhook secret is not configured', async () => {
    delete process.env.AUDIT_STRIPE_WEBHOOK_SECRET;
    const { out, r } = res();
    await handleAuditStripeWebhook(signed(body('invoice.paid')), out);
    expect(r.statusCode).toBe(503);
  });

  it('answers 500 when recording the event fails, so Stripe retries', async () => {
    handleSupportEvent.mockRejectedValue(new Error('db down'));
    const { out, r } = res();
    await handleAuditStripeWebhook(signed(body('invoice.paid')), out);
    expect(r.statusCode).toBe(500);
  });
});
