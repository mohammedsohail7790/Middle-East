import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pipeline = vi.hoisted(() => ({ startDraft: vi.fn(), handlePaid: vi.fn() }));
vi.mock('../../apps/gateway/src/services/audit/audit-pipeline.js', () => pipeline);
const send = vi.fn();
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));

/** A stand-in for the pool that behaves like the one table. */
const db = vi.hoisted(() => {
  const rows = new Map<string, { data: unknown; updated_at: Date }>();
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) { const r = rows.get(String(params[0])); return { rows: r ? [r] : [] }; }
      if (/^\s*INSERT/i.test(sql)) { const r = { data: JSON.parse(String(params[1])), updated_at: new Date() }; rows.set(String(params[0]), r); return { rows: [r] }; }
      if (/^\s*DELETE/i.test(sql)) { rows.delete(String(params[0])); return { rows: [] }; }
      return { rows: [] };
    }),
  };
  return { rows, calls, pool };
});
vi.mock('../../apps/gateway/src/services/db/pool.js', () => ({ pool: db.pool }));

let server: Server;
let base: string;
let sign: (p: any, s: string) => string;
const secret = 'test-secret-at-least-long-enough';
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

beforeEach(async () => {
  vi.resetModules();
  db.rows.clear(); db.calls.length = 0; db.pool.query.mockClear();
  send.mockReset(); send.mockResolvedValue({ id: 'x' });
  pipeline.startDraft.mockReset(); pipeline.startDraft.mockResolvedValue(undefined);
  process.env.RESEND_API_KEY = 'k';
  process.env.AUDIT_LEAD_EMAILS = 'a@example.com';
  process.env.AUDIT_LINK_SECRET = secret;
  sign = (await import('../../apps/gateway/src/services/audit/signed-link.js')).signLink;
  const { createPublicAuditRouter } = await import('../../apps/gateway/src/services/audit/public-audit.controller.js');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/audit', createPublicAuditRouter());
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/audit`;
});
afterEach(async () => { await new Promise((r) => server.close(r)); });

const link = (k = 'form2', x = exp()) => sign({ k, id: 'r1', company: 'Smith & Co', email: 'j@example.com', x }, secret);
const put = (t: string, data: unknown) => fetch(`${base}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t, data }) });
const get = (t: string) => fetch(`${base}/draft?t=${encodeURIComponent(t)}`);

describe('audit form draft', () => {
  it('round-trips a draft and a newer write overwrites the older one', async () => {
    const t = link();
    expect(((await (await get(t)).json()) as any).data).toBeNull();
    expect((await put(t, { savedAt: 1, fields: { a_company: 'Smith' } })).status).toBe(200);
    let j: any = await (await get(t)).json();
    expect(j.success).toBe(true);
    expect(j.data.data).toEqual({ savedAt: 1, fields: { a_company: 'Smith' } });
    expect(typeof j.data.updatedAt).toBe('string');
    await put(t, { savedAt: 2, fields: { a_company: 'Smith Trading' } });
    j = await (await get(t)).json();
    expect(j.data.data.fields.a_company).toBe('Smith Trading');
    expect(db.rows.size).toBe(1);
  });

  it('stores only the hash of the token, never the token', async () => {
    const t = link();
    await put(t, { savedAt: 1, fields: {} });
    await get(t);
    expect([...db.rows.keys()]).toEqual([sha(t)]);
    expect(JSON.stringify(db.calls)).not.toContain(t);
    expect(db.calls.every((c) => /\$1/.test(c.sql))).toBe(true);
  });

  it('refuses a link of the wrong kind, a tampered link and an expired link', async () => {
    expect((await get(link('pay'))).status).toBe(400);
    expect((await put(link('review'), { fields: {} })).status).toBe(400);
    const good = link();
    const tampered = good.slice(0, -3) + (good.endsWith('AAA') ? 'BBB' : 'AAA');
    expect((await get(tampered)).status).toBe(400);
    expect((await put(tampered, { fields: {} })).status).toBe(400);
    const expired = link('form2', Math.floor(Date.now() / 1000) - 10);
    expect((await get(expired)).status).toBe(410);
    expect((await put(expired, { fields: {} })).status).toBe(410);
    expect(db.pool.query).not.toHaveBeenCalled();
  });

  it('refuses an oversized body', async () => {
    const res = await put(link(), { savedAt: 1, fields: { a_company: 'x'.repeat(210 * 1024) } });
    expect(res.status).toBe(413);
    expect(db.rows.size).toBe(0);
  });

  it('refuses a draft that is not a plain object, is nested too deeply, or has odd keys', async () => {
    const t = link();
    expect((await put(t, [1, 2])).status).toBe(400);
    expect((await put(t, 'text')).status).toBe(400);
    expect((await put(t, null)).status).toBe(400);
    expect((await put(t, { a: { b: { c: { d: { e: 1 } } } } })).status).toBe(400);
    expect((await put(t, { 'bad key<script>': 'x' })).status).toBe(400);
    expect((await fetch(`${base}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"t":"' + t + '","data":{"__proto__":{"x":1}}}' })).status).toBe(400);
    expect(db.rows.size).toBe(0);
  });

  it('rejects unexpected body fields', async () => {
    const res = await fetch(`${base}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: link(), data: {}, extra: 1 }) });
    expect(res.status).toBe(400);
  });

  it('deletes the draft after a successful Form 2 submit, and keeps it when the submit fails', async () => {
    const t = link();
    await put(t, { savedAt: 1, fields: { a_company: 'Smith' } });
    const bad = await fetch(`${base}/form2`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, answers: { a_company: 'Smith' } }) });
    expect(bad.status).toBe(400);
    expect(db.rows.size).toBe(1);
    const ok = await fetch(`${base}/form2`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, answers: { a_company: 'Smith Trading, wholesale', b_process: 'Type it up' } }) });
    expect(ok.status).toBe(200);
    expect(db.rows.size).toBe(0);
    expect(((await (await get(t)).json()) as any).data).toBeNull();
  });
});
