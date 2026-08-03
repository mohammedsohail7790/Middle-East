import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(root, '../apps/gateway/.env'), 'utf8');
const url = env.match(/^GATEWAY_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) {
  console.error('GATEWAY_DATABASE_URL not found in apps/gateway/.env');
  process.exit(1);
}

const sql = readFileSync(
  join(root, '../supabase/migrations/003_integration_oauth_and_logs.sql'),
  'utf8'
);

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const before = await pool.query(
  `SELECT to_regclass('public.integration_oauth_states') AS oauth_states,
          to_regclass('public.integration_audit_log') AS audit_log`
);
console.log('Before:', before.rows[0]);

await pool.query(sql);

const after = await pool.query(
  `SELECT to_regclass('public.integration_oauth_states') AS oauth_states,
          to_regclass('public.integration_audit_log') AS audit_log`
);
console.log('After:', after.rows[0]);
console.log('Migration 003 applied');
await pool.end();
