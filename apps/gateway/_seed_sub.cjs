process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sql = "INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, trial_end) VALUES ('2a9ea1e6-fa09-497c-8107-e704af6b1802', 'professional', 'trialing', NOW(), NOW() + INTERVAL '30 days', NOW() + INTERVAL '14 days') ON CONFLICT (tenant_id) DO UPDATE SET plan = 'professional', status = 'trialing', current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days', updated_at = NOW() RETURNING id";

const check = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('subscriptions', 'voice_tenants')";

async function run() {
  const tables = await pool.query(check);
  console.log('Tables found:', tables.rows.map(r => r.table_name));
  try {
    const r = await pool.query(sql);
    console.log('OK:', r.rows[0].id);
  } catch(e) {
    console.error('ERR:', e.message, 'CODE:', e.code, 'DETAIL:', e.detail || 'none');
  }
  await pool.end();
}
run().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e.message); process.exit(1); });
