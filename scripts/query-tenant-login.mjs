import 'dotenv/config';
import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../apps/gateway/.env') });

const pool = new pg.Pool({
  connectionString: process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const tid = '2a9ea1e6-fa09-497c-8107-e704af6b1802';

const tenant = await pool.query(
  `SELECT vt.id, vt.company_name, vt.phone_number, vt.owner_user_id,
          u.email, u.raw_user_meta_data
   FROM public.voice_tenants vt
   LEFT JOIN auth.users u ON u.id = vt.owner_user_id
   WHERE vt.id = $1 OR vt.phone_number = '+19193715609'`,
  [tid]
);

const usersWithMeta = await pool.query(
  `SELECT id, email, raw_user_meta_data->>'tenant_id' AS meta_tenant
   FROM auth.users
   WHERE raw_user_meta_data->>'tenant_id' = $1`,
  [tid]
);

const sub = await pool.query(
  `SELECT plan, status, current_period_start, current_period_end
   FROM public.subscriptions WHERE tenant_id = $1`,
  [tid]
);

const calls = await pool.query(
  `SELECT call_sid, created_at, duration_ms
   FROM public.calls WHERE tenant_id = $1
   ORDER BY created_at DESC LIMIT 5`,
  [tid]
);

console.log(JSON.stringify({ tenant: tenant.rows, linkedUsers: usersWithMeta.rows, subscription: sub.rows, recentCalls: calls.rows }, null, 2));
await pool.end();
