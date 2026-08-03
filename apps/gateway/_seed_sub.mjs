import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sql = `INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, trial_end)
VALUES ('2a9ea1e6-fa09-497c-8107-e704af6b1802', 'professional', 'trialing', NOW(), NOW() + INTERVAL '30 days', NOW() + INTERVAL '14 days')
ON CONFLICT (tenant_id) DO UPDATE SET
  plan = 'professional', status = 'trialing',
  current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days',
  updated_at = NOW() RETURNING id`;

try {
  const r = await pool.query(sql);
  console.log('Subscription created:', r.rows[0].id);
} catch (e) {
  console.error('Error:', e.message);
}
await pool.end();
