import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));
const create = vi.fn();
vi.mock('stripe', () => ({ default: class { checkout = { sessions: { create } }; webhooks = { constructEvent: (b: Buffer) => JSON.parse(b.toString()) }; } }));

let server: Server;
let base: string;
let sign: (p: any, s: string) => string;
const secret = 'test-secret-at-least-long-enough';
const exp = () => Math.floor(Date.now() / 1000) + 3600;

beforeEach(async () => {
  vi.resetModules();
  send.mockReset();
  send.mockResolvedValue({ id: 'x' });
  create.mockReset();
  create.mockResolvedValue({ url: 'https://checkout.stripe.com/c/abc' });
  process.env.RESEND_API_KEY = 'k';
  process.env.AUDIT_LEAD_EMAILS = 'a@example.com,b@example.com';
  process.env.AUDIT_LINK_SECRET = secret;
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.AUDIT_STRIPE_WEBHOOK_SECRET = 'whsec_x';
  delete process.env.AUDIT_PRICES_JSON;
  sign = (await import('../../apps/gateway/src/services/audit/signed-link.js')).signLink;
  const { createPublicAuditRouter, handleAuditStripeWebhook } = await import('../../apps/gateway/src/services/audit/public-audit.controller.js');
  const app = express();
  app.post('/audit/stripe-webhook', express.raw({ type: 'application/json' }), (req, res) => void handleAuditStripeWebhook(req, res));
  app.use(express.json());
  app.use('/audit', createPublicAuditRouter());
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/audit`;
});
afterEach(async () => { await new Promise((r) => server.close(r)); });

const form2 = () => sign({ k: 'form2', id: 'r1', company: 'Smith & Co', email: 'j@example.com', x: exp() }, secret);
const pay = (cur = 'AED') => sign({ k: 'pay', id: 'r1', company: 'Smith & Co', email: 'j@example.com', x: exp(), cur }, secret);
const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('audit link check', () => {
  it('describes a valid pay link without leaking the email', async () => {
    const res = await fetch(`${base}/link?t=${pay()}`);
    const j = await res.json();
    expect(j.valid).toBe(true);
    expect(j.company).toBe('Smith & Co');
    expect(j.priceAvailable).toBe(true);
    expect(JSON.stringify(j)).not.toContain('j@example.com');
  });
  it('refuses a bad token', async () => {
    expect((await fetch(`${base}/link?t=${'x'.repeat(40)}`)).status).toBe(400);
  });
});

describe('Form 2', () => {
  it('emails the answers to every recipient', async () => {
    const res = await post('/form2', { token: form2(), answers: { p1_name: 'Invoicing', p1_steps: 'Type it up' } });
    expect(res.status).toBe(200);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toEqual(['a@example.com', 'b@example.com']);
    expect(mail.subject).toBe('Form 2 received — Smith & Co');
    expect(mail.text).toContain('Invoicing');
  });
  it('refuses an unknown question, a wrong-kind link and an empty first process', async () => {
    expect((await post('/form2', { token: form2(), answers: { evil: 'x', p1_name: 'a', p1_steps: 'b' } })).status).toBe(400);
    expect((await post('/form2', { token: pay(), answers: { p1_name: 'a', p1_steps: 'b' } })).status).toBe(400);
    expect((await post('/form2', { token: form2(), answers: { p1_name: 'a' } })).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('payment', () => {
  it('creates a Checkout session in the client currency', async () => {
    const res = await post('/pay', { token: pay() });
    expect((await res.json()).url).toContain('stripe.com');
    const args = create.mock.calls[0][0];
    expect(args.line_items[0].price_data).toMatchObject({ currency: 'aed', unit_amount: 500000 });
    expect(args.metadata.kind).toBe('audit');
  });
  it('says so when the currency has no price yet', async () => {
    expect((await post('/pay', { token: pay('SAR') })).status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });
  it('emails us when Stripe reports an audit payment, and ignores other payments', async () => {
    const evt = (meta: any) => JSON.stringify({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', currency: 'aed', amount_total: 500000, metadata: meta, customer_details: { email: 'j@example.com' } } } });
    const hook = (body: string) => fetch(`${base}/stripe-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 's' }, body });
    expect((await hook(evt({ kind: 'subscription' }))).status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect((await hook(evt({ kind: 'audit', company: 'Smith & Co', link_id: 'r1' }))).status).toBe(200);
    expect(send.mock.calls[0][0].subject).toContain('Audit PAID — Smith & Co');
  });
});
