import type { Pool } from 'pg';
import type { AlertCandidate, AlertSeverity } from './alert-rules.js';

/** The saved alerts of one business (table tenant_alerts, migration 081). Plain parameterised SQL; the pool is passed in so tests can use a real throwaway database. */
export interface AlertRow {
  id: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  title_ar: string | null;
  body: string;
  body_ar: string | null;
  href: string;
  created_at: string;
  read_at: string | null;
}

const COLUMNS = 'id, kind, severity, title, title_ar, body, body_ar, href, created_at, read_at';

/** Save an alert unless the same one (same dedupe key) was already saved for this business. Returns the new row, or null if it already existed. */
export async function raiseAlert(pool: Pick<Pool, 'query'>, tenantId: string, a: AlertCandidate): Promise<AlertRow | null> {
  const r = await pool.query(
    `INSERT INTO public.tenant_alerts (tenant_id, kind, severity, title, title_ar, body, body_ar, href, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
     RETURNING ${COLUMNS}`,
    [tenantId, a.kind, a.severity, a.title, a.titleAr, a.body, a.bodyAr, a.href, a.dedupeKey],
  );
  return (r.rows[0] as AlertRow | undefined) ?? null;
}

export async function listAlerts(pool: Pick<Pool, 'query'>, tenantId: string, limit = 30): Promise<{ alerts: AlertRow[]; unread: number }> {
  const [list, unread] = await Promise.all([
    pool.query(`SELECT ${COLUMNS} FROM public.tenant_alerts WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`, [tenantId, Math.min(Math.max(limit, 1), 100)]),
    pool.query('SELECT count(*)::int AS n FROM public.tenant_alerts WHERE tenant_id = $1 AND read_at IS NULL', [tenantId]),
  ]);
  return { alerts: list.rows as AlertRow[], unread: (unread.rows[0]?.n as number) ?? 0 };
}

/** Mark one alert read. The tenant id is part of the query, so one business can never touch another's alerts. */
export async function markAlertRead(pool: Pick<Pool, 'query'>, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('UPDATE public.tenant_alerts SET read_at = COALESCE(read_at, now()) WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return (r.rowCount ?? 0) > 0;
}

export async function markAllAlertsRead(pool: Pick<Pool, 'query'>, tenantId: string): Promise<number> {
  const r = await pool.query('UPDATE public.tenant_alerts SET read_at = now() WHERE tenant_id = $1 AND read_at IS NULL', [tenantId]);
  return r.rowCount ?? 0;
}

export async function markEmailed(pool: Pick<Pool, 'query'>, tenantId: string, id: string): Promise<void> {
  await pool.query('UPDATE public.tenant_alerts SET emailed_at = now() WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
}
