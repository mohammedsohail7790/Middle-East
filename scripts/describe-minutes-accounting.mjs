import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../apps/gateway/.env'), 'utf8');
const url = env.match(/^GATEWAY_DATABASE_URL=(.+)$/m)?.[1]?.trim();
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const r = await pool.query(
  `SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'minutes_accounting'
   ORDER BY ordinal_position`
);
console.log(JSON.stringify(r.rows, null, 2));
await pool.end();
