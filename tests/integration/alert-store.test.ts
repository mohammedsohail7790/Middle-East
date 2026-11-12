import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { listAlerts, markAlertRead, markAllAlertsRead, markEmailed, raiseAlert } from '../../apps/gateway/src/services/alerts/alert-store.js';
import { alertFromIntegrationFailure } from '../../apps/gateway/src/services/alerts/alert-rules.js';

/** The saved alerts, on a real Postgres. Runs only when AUDIT_TEST_DATABASE_URL is set (a throwaway database). It creates a tiny voice_tenants stand-in if the database has none. */
const url = process.env.AUDIT_TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b2';
const alert = (key: string) => ({ ...alertFromIntegrationFailure('hubspot', new Date('2026-11-12')), dedupeKey: key });

d('tenant alerts (real Postgres)', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;");
    await pool.query('CREATE TABLE IF NOT EXISTS public.voice_tenants (id uuid PRIMARY KEY)');
    await pool.query('INSERT INTO public.voice_tenants (id) VALUES ($1), ($2) ON CONFLICT DO NOTHING', [A, B]);
    await pool.query(readFileSync(new URL('../../supabase/migrations/081_tenant_alerts.sql', import.meta.url), 'utf8'));
  });
  beforeEach(async () => { await pool.query('DELETE FROM public.tenant_alerts WHERE tenant_id IN ($1, $2)', [A, B]); });
  afterAll(async () => { await pool.query('DELETE FROM public.tenant_alerts WHERE tenant_id IN ($1, $2)', [A, B]); await pool.end(); });

  it('saves an alert once: the same dedupe key is ignored the second time, and per business', async () => {
    expect(await raiseAlert(pool, A, alert('k1'))).not.toBeNull();
    expect(await raiseAlert(pool, A, alert('k1'))).toBeNull();
    expect(await raiseAlert(pool, B, alert('k1'))).not.toBeNull(); // another business may have the same key
    expect((await listAlerts(pool, A)).alerts).toHaveLength(1);
  });

  it('lists newest first with the unread count', async () => {
    await raiseAlert(pool, A, alert('old'));
    await new Promise((r) => setTimeout(r, 15));
    await raiseAlert(pool, A, alert('new'));
    const { alerts, unread } = await listAlerts(pool, A);
    expect(alerts.map((a) => a.title)).toHaveLength(2);
    expect(new Date(alerts[0].created_at).getTime()).toBeGreaterThanOrEqual(new Date(alerts[1].created_at).getTime());
    expect(unread).toBe(2);
  });

  it('marks one or all read, and never touches another business', async () => {
    const mine = (await raiseAlert(pool, A, alert('a')))!;
    await raiseAlert(pool, A, alert('b'));
    const theirs = (await raiseAlert(pool, B, alert('c')))!;
    expect(await markAlertRead(pool, A, theirs.id)).toBe(false); // wrong business
    expect((await listAlerts(pool, B)).unread).toBe(1);
    expect(await markAlertRead(pool, A, mine.id)).toBe(true);
    expect((await listAlerts(pool, A)).unread).toBe(1);
    expect(await markAllAlertsRead(pool, A)).toBe(1);
    expect((await listAlerts(pool, A)).unread).toBe(0);
    expect((await listAlerts(pool, B)).unread).toBe(1);
  });

  it('records when an alert was emailed', async () => {
    const row = (await raiseAlert(pool, A, alert('e')))!;
    await markEmailed(pool, A, row.id);
    const r = await pool.query('SELECT emailed_at FROM public.tenant_alerts WHERE id = $1', [row.id]);
    expect(r.rows[0].emailed_at).not.toBeNull();
  });

  it('limits the list and rejects a bad severity', async () => {
    for (let i = 0; i < 5; i++) await raiseAlert(pool, A, alert(`l${i}`));
    expect((await listAlerts(pool, A, 3)).alerts).toHaveLength(3);
    await expect(raiseAlert(pool, A, { ...alert('bad'), severity: 'urgent' as any })).rejects.toThrow();
  });

  it('is invisible to the browser roles (RLS on, no access)', async () => {
    await raiseAlert(pool, A, alert('r'));
    const c = await pool.connect();
    try {
      await c.query('SET ROLE anon');
      await expect(c.query('SELECT * FROM public.tenant_alerts')).rejects.toThrow(/permission denied/);
      await c.query('RESET ROLE');
      await c.query('SET ROLE authenticated');
      await expect(c.query('SELECT * FROM public.tenant_alerts')).rejects.toThrow(/permission denied/);
    } finally {
      await c.query('RESET ROLE').catch(() => undefined);
      c.release();
    }
  });
});
