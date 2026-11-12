import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { approve, getAudit, markDelivered, markDraftFailed, markPaid, saveDraft, saveEdits, saveSubmission } from '../../apps/gateway/src/services/audit/audit-store.js';
import { assembleReport } from '../../apps/gateway/src/services/audit/audit-report.js';

/**
 * Runs the audit store's real SQL against a real Postgres, and only when AUDIT_TEST_DATABASE_URL is set (a throwaway database, never production).
 * It applies migration 080 itself. In CI without that variable the whole file is skipped.
 */
const url = process.env.AUDIT_TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const raw = {
  assessment: { complexity: 'medium', volume: 'low', dataFormat: 'structured', systems: 'cloud', humanApproval: false, budgetMaxAed: null },
  summary: 'Acme re-types the same job details into three tools, which costs the office hours each week and causes missed invoices.',
  opportunities: [{ title: 'Capture each job once', problem: 'Typed three times.', solution: 'One entry feeds all three tools.', payoff: 'Less admin.' }],
  phaseDeliverables: [['Map'], ['Build'], ['Test']],
};
const out = () => assembleReport({ raw, lang: 'en', company: 'Acme', contactName: 'Sam', now: new Date('2026-11-12') });
const sub = { id: 'it000001', company: 'Acme', email: 'sam@acme.test', name: 'Sam', currency: 'AED', lang: 'en' as const, answers: { a_company: 'Acme', b_process: 'By hand' } };

d('audit store (real Postgres)', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;");
    await pool.query(readFileSync(new URL('../../supabase/migrations/080_audit_reports.sql', import.meta.url), 'utf8'));
  });
  beforeEach(async () => { await pool.query("DELETE FROM public.audit_reports WHERE id LIKE 'it%'"); });
  afterAll(async () => { await pool.query("DELETE FROM public.audit_reports WHERE id LIKE 'it%'"); await pool.end(); });

  it('walks the normal path: submitted, in review, edited, approved, paid, delivered', async () => {
    await saveSubmission(pool, sub);
    expect((await getAudit(pool, sub.id))?.status).toBe('submitted');
    const { report, assessment } = out();
    await saveDraft(pool, sub.id, report, assessment);
    expect((await getAudit(pool, sub.id))?.status).toBe('in_review');
    expect(await saveEdits(pool, sub.id, { ...report, summary: 'Edited by the team.' })).toBe(true);
    expect((await getAudit(pool, sub.id))?.report?.summary).toBe('Edited by the team.');
    expect(await approve(pool, sub.id)).toBe(true);
    expect(await approve(pool, sub.id)).toBe(false); // a second click does nothing
    expect(await saveEdits(pool, sub.id, report)).toBe(false); // locked after approval
    const paid = await markPaid(pool, sub.id);
    expect(paid?.status).toBe('paid');
    expect(paid?.paid_at).toBeTruthy();
    await markDelivered(pool, sub.id, true);
    const done = await getAudit(pool, sub.id);
    expect(done?.status).toBe('delivered');
    expect(done?.delivered_at).toBeTruthy();
    expect(await markPaid(pool, sub.id)).toBeNull(); // a repeated payment event cannot re-trigger delivery
  });

  it('keeps a payment that arrives before approval, and does not deliver it until approved', async () => {
    await saveSubmission(pool, sub);
    const { report, assessment } = out();
    await saveDraft(pool, sub.id, report, assessment);
    const early = await markPaid(pool, sub.id);
    expect(early?.status).toBe('in_review');
    expect(early?.paid_at).toBeTruthy();
    expect(await approve(pool, sub.id)).toBe(true);
    expect((await markPaid(pool, sub.id))?.status).toBe('paid');
  });

  it('does not approve without a draft', async () => {
    await saveSubmission(pool, sub);
    expect(await approve(pool, sub.id)).toBe(false);
  });

  it('a resubmission replaces the answers but never reopens an approved audit', async () => {
    await saveSubmission(pool, sub);
    const { report, assessment } = out();
    await saveDraft(pool, sub.id, report, assessment);
    await saveSubmission(pool, { ...sub, answers: { a_company: 'Acme', b_process: 'Fixed answer' } });
    expect((await getAudit(pool, sub.id))?.status).toBe('submitted');
    await saveDraft(pool, sub.id, report, assessment);
    await approve(pool, sub.id);
    await saveSubmission(pool, { ...sub, answers: { a_company: 'Acme', b_process: 'Late change' } });
    expect((await getAudit(pool, sub.id))?.status).toBe('approved');
  });

  it('records a failed draft and a failed delivery, and a failed delivery can be retried by a new payment event', async () => {
    await saveSubmission(pool, sub);
    await markDraftFailed(pool, sub.id);
    expect((await getAudit(pool, sub.id))?.status).toBe('draft_failed');
    const { report, assessment } = out();
    await saveDraft(pool, sub.id, report, assessment); // a retry can still produce a draft
    await approve(pool, sub.id);
    await markPaid(pool, sub.id);
    await markDelivered(pool, sub.id, false);
    expect((await getAudit(pool, sub.id))?.status).toBe('delivery_failed');
    expect((await markPaid(pool, sub.id))?.status).toBe('paid');
  });

  it('is invisible to the browser roles (RLS on, no access)', async () => {
    await saveSubmission(pool, sub);
    const c = await pool.connect();
    try {
      await c.query('SET ROLE anon');
      await expect(c.query('SELECT * FROM public.audit_reports')).rejects.toThrow(/permission denied/);
      await c.query('RESET ROLE');
      await c.query('SET ROLE authenticated');
      await expect(c.query('SELECT * FROM public.audit_reports')).rejects.toThrow(/permission denied/);
    } finally {
      await c.query('RESET ROLE').catch(() => undefined);
      c.release();
    }
  });
});
