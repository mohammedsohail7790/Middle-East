import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

let server: Server;
let base: string;

// The router keeps one rate-limit counter per visitor for the life of the module, so each test gets a fresh copy and every request here comes from the same address.
beforeEach(async () => {
  vi.resetModules();
  send.mockReset();
  send.mockResolvedValue({ id: 'x' });
  process.env.RESEND_API_KEY = 'test-key';
  process.env.CONSULT_LEAD_EMAIL = 'leads@example.com';
  delete process.env.FIT_CHECK_LEAD_EMAILS;
  const { createPublicFitCheckRouter } = await import('../../apps/gateway/src/services/leads/public-fit-check.controller.js');
  const app = express();
  app.use(express.json());
  app.use('/fit-check', createPublicFitCheckRouter());
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/fit-check`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const valid = {
  name: 'Jordan Smith', email: 'jordan@example.com', role: 'owner', decider: 'yes', company: 'Smith & Co', size: '16-50', office: '6-15', departments: 'Sales, Finance and accounts', industry: 'Trading', country: 'United Arab Emirates', city: 'Dubai',
  accounting: 'QuickBooks', erp: 'Odoo', pain: 'Quotes and invoices', problem: 'Invoices are typed by hand from emails and it takes two days every month.',
  hours: '20-50', start: '1-3-months', budget: '5000-15000', consent: true,
};
const post = (body: unknown) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('POST /public/fit-check', () => {
  it('emails the request to us with the verdict first, and sends nothing to the prospect', async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toEqual(['leads@example.com']);
    expect(mail.replyTo).toBe('jordan@example.com');
    expect(mail.subject).toBe('New Fit Check — GREEN — Smith & Co');
    expect(mail.text).toContain('GREEN: a good fit');
    expect(mail.text.indexOf('GREEN')).toBeLessThan(mail.text.indexOf('Jordan Smith'));
  });

  it('accepts a company of any size, and tells us the currency to quote in for its country', async () => {
    const res = await post({ ...valid, size: '150+', country: 'Saudi Arabia', city: 'Riyadh' });
    expect(res.status).toBe(200);
    const mail = send.mock.calls[0][0];
    expect(mail.subject).not.toContain('over 50');
    expect(mail.text).toContain('Saudi Arabia, Riyadh');
    expect(mail.text).toContain('SAR');
    expect(mail.text).toContain('Sales, Finance and accounts');
  });

  it('needs only the required answers: phone, website, CRM, hours and budget are optional', async () => {
    const { hours: _h, budget: _b, office: _o, departments: _d, city: _c, ...minimal } = valid;
    expect((await post(minimal)).status).toBe(200);
    expect(send.mock.calls[0][0].subject).toContain('AMBER'); // budget and hours unknown
  });

  it('refuses a request without consent, with an unknown field, or with an answer outside the list', async () => {
    expect((await post({ ...valid, consent: false })).status).toBe(400);
    expect((await post({ ...valid, surprise: 'x' })).status).toBe(400);
    expect((await post({ ...valid, size: '1000' })).status).toBe(400);
    expect((await post({ ...valid, email: 'nope' })).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a country we do not list and a budget band that no longer exists', async () => {
    expect((await post({ ...valid, country: 'Atlantis' })).status).toBe(400);
    expect((await post({ ...valid, budget: 'under-2500' })).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('puts what a visitor typed into the email as text, not as HTML', async () => {
    await post({ ...valid, company: '<img src=x onerror=alert(1)>', problem: '<script>alert(1)</script> invoices take two days every month' });
    const mail = send.mock.calls[0][0];
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).not.toContain('<script>alert');
    expect(mail.html).toContain('&lt;img src=x');
  });

  it('tells the visitor plainly when delivery fails', async () => {
    send.mockRejectedValue(new Error('provider down'));
    const res = await post(valid);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('hello@hallaai.com');
  });

  it('stops one visitor after 5 requests in 15 minutes', async () => {
    for (let i = 0; i < 5; i++) expect((await post(valid)).status).toBe(200);
    expect((await post(valid)).status).toBe(429);
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('sends the request to every address in FIT_CHECK_LEAD_EMAILS, so Hk and the owner both receive it, and skips anything that is not an address', async () => {
    process.env.FIT_CHECK_LEAD_EMAILS = 'hk@halla.test, owner@halla.test, not-an-address';
    vi.resetModules();
    const { createPublicFitCheckRouter } = await import('../../apps/gateway/src/services/leads/public-fit-check.controller.js');
    const app = express();
    app.use(express.json());
    app.use('/fit-check', createPublicFitCheckRouter());
    const second = await new Promise<Server>((resolve) => {
      const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
    });
    try {
      const url = `http://127.0.0.1:${(second.address() as AddressInfo).port}/fit-check`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
      expect(res.status).toBe(200);
      expect(send.mock.calls[0][0].to).toEqual(['hk@halla.test', 'owner@halla.test']);
    } finally {
      await new Promise((resolve) => second.close(resolve));
    }
  });
});
