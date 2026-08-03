import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const tenantId = process.argv[2];
if (!tenantId) {
  console.error('Usage: node backfill-tenant-minutes.mjs <tenant-id>');
  process.exit(1);
}

const root = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(root, '../apps/gateway/.env'), 'utf8');
const url = env.match(/^GATEWAY_DATABASE_URL=(.+)$/m)?.[1]?.trim();
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const sub = await pool.query(
  `SELECT id, status, current_period_start, current_period_end
   FROM public.subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
  [tenantId]
);
const row = sub.rows[0];
const isTrialing = row?.status === 'trialing';
const periodStart = row?.current_period_start?.toISOString?.().slice(0, 10) || new Date().toISOString().slice(0, 10);
const periodEnd = row?.current_period_end?.toISOString?.().slice(0, 10) || periodStart;

const calls = await pool.query(
  `SELECT call_sid, duration_ms FROM public.calls
   WHERE tenant_id = $1 AND COALESCE(duration_ms, 0) > 0
   ORDER BY created_at ASC`,
  [tenantId]
);

let inserted = 0;
let totalMinutes = 0;
for (const c of calls.rows) {
  const billed = Math.max(1, Math.ceil(c.duration_ms / 60000));
  const durationSeconds = Math.max(1, Math.ceil(c.duration_ms / 1000));
  try {
    const r = await pool.query(
      `INSERT INTO public.minutes_accounting
       (tenant_id, subscription_id, call_sid, duration_seconds, billed_minutes, minutes, source, is_trial, billing_period_start, billing_period_end)
       VALUES ($1, $2, $3, $4, $5, $6::numeric, 'voice', $7, $8, $9)
       ON CONFLICT (tenant_id, call_sid, source) DO NOTHING
       RETURNING id`,
      [tenantId, row?.id || null, c.call_sid, durationSeconds, billed, billed, isTrialing, periodStart, periodEnd]
    );
    if (r.rowCount > 0) {
      inserted += 1;
      totalMinutes += billed;
    }
  } catch (e) {
    console.warn('skip', c.call_sid, e.message);
  }
}

if (isTrialing && totalMinutes > 0) {
  await pool.query(
    `UPDATE public.subscriptions
     SET trial_minutes_used = (
       SELECT COALESCE(SUM(billed_minutes), 0)::int
       FROM public.minutes_accounting
       WHERE tenant_id = $1 AND is_trial = true
     )
     WHERE tenant_id = $1 AND status = 'trialing'`,
    [tenantId]
  );
}

console.log(JSON.stringify({ tenantId, calls: calls.rows.length, inserted, totalMinutes }, null, 2));
await pool.end();
