/**
 * The prospect store: SQL shape and input handling with a stand-in pool, plus (when LEADS_TEST_DATABASE_URL points at a database that has migrations 080 and 084)
 * the real forward-only status behaviour.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  capAnswers, clampPaging, countByStatus, createLead, listLeads, markLeadStatusByEmail, markLeadStatusSafe, recordLead, updateLead, LEAD_STATUSES, MAX_ANSWERS_CHARS, STATUS_ORDER,
} from '../../../apps/gateway/src/services/consultancy/lead-store.js';

const fake = (rows: any[] = [], rowCount = 1) => ({ query: vi.fn().mockResolvedValue({ rows, rowCount }) });

describe('status order', () => {
  it('has the forward path in the agreed order and keeps lost outside it', () => {
    expect(STATUS_ORDER).toEqual(['new', 'approved', 'form_sent', 'form_received', 'audit_in_review', 'audit_paid', 'proposal_sent', 'won']);
    expect(LEAD_STATUSES).toContain('lost');
    expect(STATUS_ORDER).not.toContain('lost');
  });
});

describe('markLeadStatusByEmail', () => {
  it('moves only forward in SQL: skips lost, compares positions in the order list, lowercases the email', async () => {
    const db = fake();
    expect(await markLeadStatusByEmail(db, '  Sam@Acme.TEST ', 'form_received')).toBe(true);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("status <> 'lost'");
    expect(sql).toMatch(/array_position\(\$3::text\[\], status\) < array_position\(\$3::text\[\], \$2\)/);
    expect(params[0]).toBe('sam@acme.test');
    expect(params[1]).toBe('form_received');
    expect(params[2]).toEqual([...STATUS_ORDER]);
  });
  it('reports false when no lead moved', async () => {
    expect(await markLeadStatusByEmail(fake([], 0), 'a@b.co', 'won')).toBe(false);
  });
  it('never runs for lost, a blank email or an unknown status', async () => {
    const db = fake();
    expect(await markLeadStatusByEmail(db, 'a@b.co', 'lost')).toBe(false);
    expect(await markLeadStatusByEmail(db, '  ', 'won')).toBe(false);
    expect(await markLeadStatusByEmail(db, 'a@b.co', 'bogus' as any)).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('the safe version swallows a database failure', async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error('connection to db at 10.0.0.1 for sam@acme.test refused')) };
    await expect(markLeadStatusSafe(db, 'sam@acme.test', 'won')).resolves.toBeUndefined();
  });
});

describe('listLeads', () => {
  it('filters by status and search with parameters only, newest first, and paginates', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce({ rows: [{ id: '1' }] }).mockResolvedValueOnce({ rows: [{ n: 7 }] }) };
    const r = await listLeads(db, { status: 'new', q: "50%_o'brien", limit: 10, offset: 20 });
    expect(r).toEqual({ items: [{ id: '1' }], total: 7 });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(sql).toContain('status = $1');
    expect(sql).toContain('ILIKE $2');
    expect(sql).not.toContain("o'brien");
    expect(params).toEqual(['new', "%50\\%\\_o'brien%", 10, 20]);
    expect(db.query.mock.calls[1][1]).toEqual(['new', "%50\\%\\_o'brien%"]);
  });
  it('lists everything when there is no filter', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ n: 0 }] }) };
    await listLeads(db, {});
    expect(db.query.mock.calls[0][0]).not.toContain('WHERE');
    expect(db.query.mock.calls[0][1]).toEqual([50, 0]);
  });
  it('clamps paging to sane values', () => {
    expect(clampPaging(9999, -5)).toEqual({ limit: 200, offset: 0 });
    expect(clampPaging('abc', 'x')).toEqual({ limit: 50, offset: 0 });
    expect(clampPaging(0, 3)).toEqual({ limit: 50, offset: 3 });
  });
  it('counts every status, zero included', async () => {
    const counts = await countByStatus(fake([{ status: 'new', n: 3 }, { status: 'won', n: 1 }, { status: 'weird', n: 9 }]));
    expect(counts.new).toBe(3);
    expect(counts.won).toBe(1);
    expect(counts.lost).toBe(0);
    expect(Object.keys(counts)).toHaveLength(LEAD_STATUSES.length);
  });
});

describe('updateLead', () => {
  it('changes only the fields given', async () => {
    const db = fake([{ id: 'x' }]);
    await updateLead(db, 'x', { notes: ' call Monday ', owner_email: 'Hk@Halla.com' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('notes = $2');
    expect(sql).toContain('owner_email = $3');
    expect(sql).not.toContain('status =');
    expect(params).toEqual(['x', 'call Monday', 'hk@halla.com']);
  });
  it('can clear notes and owner', async () => {
    const db = fake([{ id: 'x' }]);
    await updateLead(db, 'x', { notes: '', owner_email: null });
    expect(db.query.mock.calls[0][1]).toEqual(['x', null, null]);
  });
});

describe('answers', () => {
  it('keeps the answers as submitted when small', () => {
    const a = { name: 'Sam', consent: true };
    expect(capAnswers(a)).toBe(a);
  });
  it('cuts long values, then falls back to a marker, so the size is capped', () => {
    const long = capAnswers({ problem: 'x'.repeat(MAX_ANSWERS_CHARS * 2), name: 'Sam' }) as any;
    expect(long.problem).toHaveLength(2000);
    expect(JSON.stringify(long).length).toBeLessThanOrEqual(MAX_ANSWERS_CHARS);
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, 'y'.repeat(1500)]));
    expect(capAnswers(many)).toEqual({ _truncated: true });
    expect(capAnswers('nope')).toEqual({});
    expect(capAnswers([1])).toEqual({});
  });
  it('stores a lead with parameters and lowercased email', async () => {
    const db = fake([{ id: '1' }]);
    await createLead(db, { source: 'fit_check', company: 'Acme', email: 'Sam@Acme.test', answers: { a: 1 } });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO public.consultancy_leads');
    expect(sql).not.toContain('Acme');
    expect(params[0]).toBe('fit_check');
    expect(params[3]).toBe('sam@acme.test');
    expect(params[6]).toBe('{"a":1}');
  });
});

describe('recordLead', () => {
  it('never throws and logs without personal data when the database fails', async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error('insert failed for sam@acme.test')) };
    const { logger } = await import('../../../apps/gateway/src/services/logger.js');
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    await expect(recordLead({ source: 'fit_check', company: 'Acme', email: 'sam@acme.test' }, db)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/sam@acme|Acme/);
    spy.mockRestore();
  });
});

const url = process.env.LEADS_TEST_DATABASE_URL;
describe.skipIf(!url)('forward-only status against a real database', () => {
  it('moves forward, never back, never off lost', async () => {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url });
    try {
      const email = `t-${Date.now()}@forward.test`;
      const lead = await createLead(pool, { source: 'manual', company: 'T', email });
      const status = async () => (await pool.query('SELECT status FROM public.consultancy_leads WHERE id = $1', [lead.id])).rows[0].status;
      expect(await markLeadStatusByEmail(pool, email.toUpperCase(), 'form_received')).toBe(true);
      expect(await status()).toBe('form_received');
      expect(await markLeadStatusByEmail(pool, email, 'approved')).toBe(false);
      expect(await markLeadStatusByEmail(pool, email, 'form_received')).toBe(false);
      expect(await status()).toBe('form_received');
      expect(await markLeadStatusByEmail(pool, email, 'audit_paid')).toBe(true);
      await updateLead(pool, lead.id, { status: 'lost' });
      expect(await markLeadStatusByEmail(pool, email, 'won')).toBe(false);
      expect(await status()).toBe('lost');
      const list = await listLeads(pool, { q: 'forward.test', status: 'lost' });
      expect(list.items.some((l) => l.id === lead.id)).toBe(true);
      await pool.query('DELETE FROM public.consultancy_leads WHERE id = $1', [lead.id]);
    } finally {
      await pool.end();
    }
  });
});
