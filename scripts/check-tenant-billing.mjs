import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../apps/gateway/.env');
const env = readFileSync(envPath, 'utf8');
const url = env.match(/^GATEWAY_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) {
  console.error('GATEWAY_DATABASE_URL not found');
  process.exit(1);
}

const tenantId = process.argv[2] || 'ddcef16d-a676-418d-92fe-b13f870cfa46';
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function q(label, sql, params) {
  try {
    const r = await pool.query(sql, params);
    console.log('---', label, '---');
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.log('---', label, 'ERROR ---', e.message);
  }
}

await q('tenant', `SELECT * FROM public.voice_tenants WHERE id = $1`, [tenantId]);
await q(
  'subscription',
  `SELECT id, plan, status, trial_started_at, trial_expires_at, trial_minutes_used,
          included_minutes, current_period_start, current_period_end,
          (stripe_customer_id IS NOT NULL) AS has_stripe, created_at, updated_at
   FROM public.subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC`,
  [tenantId]
);
await q(
  'trial_minutes_accounting',
  `SELECT COALESCE(SUM(billed_minutes), 0)::int AS total_billed,
          COUNT(*)::int AS rows,
          COUNT(*) FILTER (WHERE is_trial = true)::int AS trial_rows
   FROM public.minutes_accounting WHERE tenant_id = $1`,
  [tenantId]
);
await q(
  'trial_minutes_detail',
  `SELECT call_sid, duration_seconds, billed_minutes, source, is_trial, billing_period_start
   FROM public.minutes_accounting WHERE tenant_id = $1 ORDER BY billing_period_start DESC NULLS LAST LIMIT 15`,
  [tenantId]
);
await q(
  'recent_calls',
  `SELECT * FROM public.calls WHERE tenant_id = $1 ORDER BY created_at DESC NULLS LAST LIMIT 5`,
  [tenantId]
);
await q(
  'provisioned_phones',
  `SELECT phone_number, status, created_at
   FROM public.tenant_phone_numbers WHERE tenant_id = $1 LIMIT 5`,
  [tenantId]
);

await pool.end();
