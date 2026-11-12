import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pipeline = vi.hoisted(() => ({ startDraft: vi.fn(), handlePaid: vi.fn() }));
vi.mock('../../apps/gateway/src/services/audit/audit-pipeline.js', () => pipeline);
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
  pipeline.startDraft.mockReset();
  pipeline.startDraft.mockResolvedValue(undefined);
  pipeline.handlePaid.mockReset();
  pipeline.handlePaid.mockResolvedValue('no-record');
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
    const res = await post('/form2', { token: form2(), answers: { a_company: 'Smith Trading, wholesale', b_process: 'Type it up' } });
    expect(res.status).toBe(200);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toEqual(['a@example.com', 'b@example.com']);
    expect(mail.subject).toBe('Form 2 received — Smith & Co');
    expect(mail.text).toContain('Smith Trading, wholesale');
  });
  it('does not say the answers were received when Resend refuses the email (it returns an error instead of throwing)', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'validation_error', statusCode: 403, message: 'The hallaai.com domain is not verified.' } });
    const res = await post('/form2', { token: form2(), answers: { a_company: 'Smith Trading, wholesale', b_process: 'Type it up' } });
    expect(res.status).toBe(502);
  });
  it('refuses an unknown question, a wrong-kind link and an empty first process', async () => {
    expect((await post('/form2', { token: form2(), answers: { evil: 'x', a_company: 'a', b_process: 'b' } })).status).toBe(400);
    expect((await post('/form2', { token: pay(), answers: { a_company: 'a', b_process: 'b' } })).status).toBe(400);
    expect((await post('/form2', { token: form2(), answers: { a_company: 'a' } })).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
    expect(pipeline.startDraft).not.toHaveBeenCalled();
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
  it('charges a three-decimal currency in thousandths, and refuses an unknown currency', async () => {
    await post('/pay', { token: pay('KWD') });
    expect(create.mock.calls[0][0].line_items[0].price_data).toMatchObject({ currency: 'kwd', unit_amount: 425000 });
    create.mockClear();
    expect((await post('/pay', { token: pay('USD') })).status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });
  it('emails us when Stripe reports an audit payment, and ignores other payments', async () => {
    const evt = (meta: any) => JSON.stringify({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', currency: 'aed', amount_total: 500000, metadata: meta, customer_details: { email: 'j@example.com' } } } });
    const hook = (body: string) => fetch(`${base}/stripe-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 's' }, body });
    expect((await hook(evt({ kind: 'subscription' }))).status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect((await hook(evt({ kind: 'audit', company: 'Smith & Co', link_id: 'r1' }))).status).toBe(200);
    expect(send.mock.calls[0][0].subject).toContain('Audit PAID — Smith & Co');
    // and the client gets a short confirmation that the audit has started
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].to).toEqual(['j@example.com']);
    expect(send.mock.calls[1][0].subject).toContain('payment');
    expect(pipeline.handlePaid).toHaveBeenCalledWith('r1');
  });

  it('does not send the "we will email your audit" note when the audit PDF was just delivered automatically', async () => {
    pipeline.handlePaid.mockResolvedValue('delivered');
    const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', currency: 'aed', amount_total: 500000, metadata: { kind: 'audit', company: 'Smith & Co', link_id: 'r2' }, customer_details: { email: 'j@example.com' } } } });
    const res = await fetch(`${base}/stripe-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 's' }, body });
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1); // only our own "Audit PAID" email
  });

  it('still answers Stripe with success if the automatic delivery step crashes', async () => {
    pipeline.handlePaid.mockRejectedValue(new Error('boom'));
    const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', currency: 'aed', amount_total: 500000, metadata: { kind: 'audit', company: 'Smith & Co', link_id: 'r3' }, customer_details: { email: 'j@example.com' } } } });
    expect((await fetch(`${base}/stripe-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 's' }, body })).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2); // our email and the generic confirmation
  });
});

describe('the live flow', () => {
  const approve = () => sign({ k: 'approve', id: 'r9', company: 'Smith & Co', email: 'j@example.com', name: 'Jordan', cur: 'AED', x: exp() }, secret);
  const form2cur = (cur?: string) => sign({ k: 'form2', id: 'r2', company: 'Smith & Co', email: 'j@example.com', name: 'Jordan', x: exp(), ...(cur ? { cur } : {}) }, secret);

  it('shows a page first and sends nothing until the button is pressed', async () => {
    const res = await fetch(`${base}/approve?t=${approve()}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Send the audit questionnaire?');
    expect(send).not.toHaveBeenCalled();
  });

  it('emails the client their questionnaire link once, even if the button is pressed twice', async () => {
    const t = approve();
    const first = await fetch(`${base}/approve?t=${t}&confirm=1`);
    expect(first.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toEqual(['j@example.com']);
    expect(mail.subject).toContain('questionnaire');
    expect(mail.html).toContain('/audit?t=');
    const again = await fetch(`${base}/approve?t=${t}&confirm=1`);
    expect(await again.text()).toContain('Already sent');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refuses an approve link of the wrong kind or a bad one', async () => {
    expect((await fetch(`${base}/approve?t=${form2()}&confirm=1`)).status).toBe(400);
    expect((await fetch(`${base}/approve?t=${'x'.repeat(40)}&confirm=1`)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('thanks the client without a payment link, tells us a draft is on its way, and starts the draft', async () => {
    const res = await post('/form2', { token: form2cur('AED'), answers: { a_company: 'Smith Trading, wholesale', b_process: 'Type it up' } });
    expect(res.status).toBe(200);
    expect((await res.json()).payUrl).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
    const team = send.mock.calls[0][0];
    expect(team.to).toEqual(['a@example.com', 'b@example.com']);
    expect(team.html).not.toContain('/send-payment?t=');
    expect(team.text).toContain('A draft audit is being written');
    expect(pipeline.startDraft).toHaveBeenCalledTimes(1);
    expect(pipeline.startDraft.mock.calls[0][0]).toMatchObject({ company: 'Smith & Co' });
    expect(pipeline.startDraft.mock.calls[0][1]).toMatchObject({ a_company: 'Smith Trading, wholesale' });
    const client = send.mock.calls[1][0];
    expect(client.to).toEqual(['j@example.com']);
    expect(client.subject).toContain('We received your questionnaire');
    expect(client.html).not.toContain('/audit/pay?t=');
  });

  it('still reports success to the client if the background draft step fails', async () => {
    pipeline.startDraft.mockRejectedValue(new Error('draft crashed'));
    const res = await post('/form2', { token: form2cur('AED'), answers: { a_company: 'Smith Trading, wholesale', b_process: 'Type it up' } });
    expect(res.status).toBe(200);
  });

  it('still reports success if the thank-you email to the client fails after our own email went out', async () => {
    send.mockResolvedValueOnce({ id: 'x' }).mockRejectedValueOnce(new Error('boom'));
    const res = await post('/form2', { token: form2cur('AED'), answers: { a_company: 'Smith Trading, wholesale', b_process: 'Type it up' } });
    expect(res.status).toBe(200);
  });

  it('puts "equivalent to AED 5,000" next to a price in another currency, and never caches the link check', async () => {
    const t = sign({ k: 'pay', id: 'r5', company: 'Smith & Co', email: 'j@example.com', x: exp(), cur: 'SAR' }, secret);
    const res = await fetch(`${base}/link?t=${t}`);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect((await res.json()).priceText).toBe('SAR 5,100 (equivalent to AED 5,000)');
    const aed = await (await fetch(`${base}/link?t=${pay('AED')}`)).json();
    expect(aed.priceText).toBe('AED 5,000');
  });

  it('words the questionnaire email as Hk asked: payment link after the audit, not at submit', async () => {
    await fetch(`${base}/approve?t=${approve()}&confirm=1`);
    const mail = send.mock.calls[0][0];
    expect(mail.text).toContain('proceed with the Opportunity Audit');
    expect(mail.text).toContain('We will then send you a payment link');
    expect(mail.text).toContain('AED 5,000');
    expect(mail.text).not.toContain('When you send it, you receive the payment link');
  });
});

describe('sending the payment link once the audit is ready', () => {
  const sendpay = (cur?: string) => sign({ k: 'sendpay', id: 'r7', company: 'Smith & Co', email: 'j@example.com', name: 'Jordan', x: exp(), ...(cur ? { cur } : {}) }, secret);

  it('shows a page first and sends nothing until the button is pressed', async () => {
    const res = await fetch(`${base}/send-payment?t=${sendpay('AED')}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Is the audit ready?');
    expect(send).not.toHaveBeenCalled();
  });

  it('emails the client a payment link once, saying the audit is ready, with the dirham equivalent', async () => {
    const t = sendpay('SAR');
    expect((await fetch(`${base}/send-payment?t=${t}&confirm=1`)).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toEqual(['j@example.com']);
    expect(mail.subject).toContain('Your Opportunity Audit is ready');
    expect(mail.text).toContain('SAR 5,100 (equivalent to AED 5,000)');
    expect(mail.html).toContain('/audit/pay?t=');
    expect(await (await fetch(`${base}/send-payment?t=${t}&confirm=1`)).text()).toContain('Already sent');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('says so, and sends nothing, when the link has no payment currency', async () => {
    const text = await (await fetch(`${base}/send-payment?t=${sendpay()}&confirm=1`)).text();
    expect(text).toContain('No payment currency');
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a link of the wrong kind', async () => {
    expect((await fetch(`${base}/send-payment?t=${form2()}&confirm=1`)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
