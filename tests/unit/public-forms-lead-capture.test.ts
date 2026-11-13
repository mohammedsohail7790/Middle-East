/** The public forms keep the prospect in the pipeline, and a database failure never changes what the visitor sees. */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));
const query = vi.hoisted(() => vi.fn());
vi.mock('../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query } }));

let server: Server;
const hold: Array<() => void> = [];

async function start(kind: 'fit' | 'consult') {
  vi.resetModules();
  const app = express();
  app.use(express.json());
  if (kind === 'fit') {
    const { createPublicFitCheckRouter } = await import('../../apps/gateway/src/services/leads/public-fit-check.controller.js');
    app.use('/f', createPublicFitCheckRouter());
  } else {
    const { createPublicConsultRequestRouter } = await import('../../apps/gateway/src/services/leads/public-consult-request.controller.js');
    app.use('/f', createPublicConsultRequestRouter());
  }
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/f`;
}
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ id: 'x' });
  query.mockReset();
  query.mockResolvedValue({ rows: [{ id: '1' }], rowCount: 1 });
  process.env.RESEND_API_KEY = 'test-key';
  process.env.CONSULT_LEAD_EMAIL = 'leads@example.com';
});
afterEach(async () => { hold.splice(0).forEach((f) => f()); await new Promise((r) => server.close(r)); });

const fit = {
  name: 'Jordan Smith', email: 'Jordan@Example.com', phone: '+971 50', role: 'owner', decider: 'yes', company: 'Smith & Co', size: '16-50', industry: 'Trading', country: 'United Arab Emirates',
  accounting: 'QuickBooks', erp: 'Odoo', pain: 'Quotes', problem: 'Invoices are typed by hand.', start: '1-3-months', consent: true,
};
const insertCalls = () => query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO public.consultancy_leads'));

describe('fit check', () => {
  it('stores the lead with the answers as submitted, and still emails exactly as before', async () => {
    const url = await start('fit');
    const res = await post(url, fit);
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(insertCalls()).toHaveLength(1));
    const p = insertCalls()[0][1];
    expect(p[0]).toBe('fit_check');
    expect(p[1]).toBe('Smith & Co');
    expect(p[3]).toBe('jordan@example.com');
    expect(JSON.parse(p[6])).toMatchObject({ problem: 'Invoices are typed by hand.', consent: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a failing database write does not fail the form and is logged without personal data', async () => {
    query.mockRejectedValue(new Error('relation does not exist for jordan@example.com'));
    const url = await start('fit');
    const { logger } = await import('../../apps/gateway/src/services/logger.js');
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const res = await post(url, fit);
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(spy.mock.calls.some((c) => String(c[0]).includes('[Leads]'))).toBe(true));
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/jordan|Smith/i);
    spy.mockRestore();
  });

  it('does not wait for a slow database', async () => {
    query.mockImplementation(() => new Promise((resolve) => { hold.push(() => resolve({ rows: [], rowCount: 0 })); }));
    const url = await start('fit');
    const t = Date.now();
    const res = await post(url, fit);
    expect(res.status).toBe(200);
    expect(Date.now() - t).toBeLessThan(1500);
  });
});

describe('consult request', () => {
  const body = { name: 'Sam Lee', email: 'sam@acme.test', business: 'Acme', priority: 'Invoices', notes: 'Call me' };
  it('stores the lead as a consult request', async () => {
    const url = await start('consult');
    expect((await post(url, body)).status).toBe(200);
    await vi.waitFor(() => expect(insertCalls()).toHaveLength(1));
    const p = insertCalls()[0][1];
    expect(p[0]).toBe('consult_request');
    expect(p[1]).toBe('Acme');
    expect(JSON.parse(p[6])).toEqual({ business: 'Acme', priority: 'Invoices', notes: 'Call me' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('a failing database write does not fail the form', async () => {
    query.mockRejectedValue(new Error('down'));
    const url = await start('consult');
    expect((await post(url, body)).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
