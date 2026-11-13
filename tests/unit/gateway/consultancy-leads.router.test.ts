/** The team's leads API, run over HTTP against a fake pool. The team gate itself is tested in consultancy-admin-access.test.ts. */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLeadsRouter } from '../../../apps/gateway/src/services/consultancy/consultancy-leads.router.js';

const ID = '11111111-2222-4333-8444-555555555555';
const lead = (over: any = {}) => ({ id: ID, source: 'fit_check', company: 'Acme', contact_name: 'Sam', email: 'sam@acme.test', status: 'new', notes: null, owner_email: null, answers: { problem: 'Invoices by hand' }, ...over });

let server: Server;
let base: string;
let pool: { query: ReturnType<typeof vi.fn> };
let rows: Record<string, any>;

beforeEach(async () => {
  rows = { list: [lead()], total: 1, counts: [{ status: 'new', n: 1 }], one: lead(), audit: null, update: lead({ status: 'approved' }) };
  pool = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO')) return { rows: [lead({ source: 'manual' })], rowCount: 1 };
      if (sql.includes('UPDATE public.consultancy_leads')) return { rows: rows.update ? [rows.update] : [], rowCount: rows.update ? 1 : 0 };
      if (sql.includes('GROUP BY status')) return { rows: rows.counts };
      if (sql.includes('count(*)')) return { rows: [{ n: rows.total }] };
      if (sql.includes('FROM public.audit_reports')) return { rows: rows.audit ? [rows.audit] : [] };
      if (sql.includes('WHERE id = $1')) return { rows: rows.one ? [rows.one] : [] };
      return { rows: rows.list };
    }),
  };
  const app = express();
  app.use((req, _res, next) => { (req as any).consultancyAdminEmail = 'team@halla.com'; next(); });
  app.use('/leads', createLeadsRouter({ pool }));
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/leads`;
});
afterEach(async () => { await new Promise((r) => server.close(r)); });

const call = async (path: string, method = 'GET', body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
};

describe('GET /', () => {
  it('returns the leads, the total and a count for every status', async () => {
    const r = await call('/?status=new&q=acme&limit=5&offset=10');
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    expect(r.json.data.items).toHaveLength(1);
    expect(r.json.data.total).toBe(1);
    expect(r.json.data.counts.new).toBe(1);
    expect(r.json.data.counts.won).toBe(0);
    const listCall = pool.query.mock.calls.find((c) => String(c[0]).includes('ORDER BY'))!;
    expect(listCall[1]).toEqual(['new', '%acme%', 5, 10]);
  });
  it('rejects an unknown status filter', async () => {
    const r = await call('/?status=bogus');
    expect(r.status).toBe(400);
    expect(r.json.success).toBe(false);
  });
  it('answers 500 without leaking the database error', async () => {
    pool.query.mockRejectedValue(new Error('password authentication failed for user "x"'));
    const r = await call('/');
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.json)).not.toContain('password');
  });
});

describe('GET /:id', () => {
  it('returns the lead with a summary of its audit when there is one', async () => {
    rows.audit = { id: 'ab12cd34', status: 'in_review', fee_aed: '4500', summary: 'Acme re-types jobs.' };
    const r = await call(`/${ID}`);
    expect(r.status).toBe(200);
    expect(r.json.data.lead.company).toBe('Acme');
    expect(r.json.data.audit).toMatchObject({ id: 'ab12cd34', status: 'in_review', fee_aed: 4500 });
  });
  it('returns audit null when none', async () => {
    expect((await call(`/${ID}`)).json.data.audit).toBeNull();
  });
  it('is 404 for an unknown or malformed id', async () => {
    rows.one = null;
    expect((await call(`/${ID}`)).status).toBe(404);
    expect((await call('/not-a-uuid')).status).toBe(404);
  });
});

describe('PATCH /:id', () => {
  it('changes status, notes and owner', async () => {
    const r = await call(`/${ID}`, 'PATCH', { status: 'approved', notes: 'Called', owner_email: 'hk@halla.com' });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe('approved');
    const c = pool.query.mock.calls.find((x) => String(x[0]).includes('UPDATE'))!;
    expect(c[1]).toEqual([ID, 'approved', 'Called', 'hk@halla.com']);
  });
  it('rejects a status outside the list, other fields, bad emails and empty bodies', async () => {
    expect((await call(`/${ID}`, 'PATCH', { status: 'maybe' })).status).toBe(400);
    expect((await call(`/${ID}`, 'PATCH', { company: 'Hacked' })).status).toBe(400);
    expect((await call(`/${ID}`, 'PATCH', { owner_email: 'nope' })).status).toBe(400);
    expect((await call(`/${ID}`, 'PATCH', { notes: 5 })).status).toBe(400);
    expect((await call(`/${ID}`, 'PATCH', { notes: 'x'.repeat(5001) })).status).toBe(400);
    expect((await call(`/${ID}`, 'PATCH', {})).status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
  it('lets the team set a lead to lost', async () => {
    expect((await call(`/${ID}`, 'PATCH', { status: 'lost' })).status).toBe(200);
  });
  it('is 404 when the lead does not exist', async () => {
    rows.update = null;
    expect((await call(`/${ID}`, 'PATCH', { notes: 'x' })).status).toBe(404);
  });
});

describe('POST /', () => {
  it('adds a manual lead owned by the signed-in team member', async () => {
    const r = await call('/', 'POST', { company: 'Acme', contact_name: 'Sam', email: 'Sam@Acme.test', phone: '+971 5', country: 'UAE', notes: 'Met at event' });
    expect(r.status).toBe(201);
    expect(r.json.success).toBe(true);
    const c = pool.query.mock.calls.find((x) => String(x[0]).includes('INSERT'))!;
    expect(c[1][0]).toBe('manual');
    expect(c[1][8]).toBe('team@halla.com');
  });
  it('needs something to identify the lead and a valid email', async () => {
    expect((await call('/', 'POST', { phone: '123' })).status).toBe(400);
    expect((await call('/', 'POST', { company: 'A', email: 'bad' })).status).toBe(400);
    expect((await call('/', 'POST', { company: 5 })).status).toBe(400);
    expect((await call('/', 'POST', { company: 'x'.repeat(201) })).status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
