import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(root, '../apps/gateway/.env'), 'utf8');
const url = env.match(/^GATEWAY_DATABASE_URL=(.+)$/m)?.[1]?.trim();
const sql = readFileSync(join(root, '../supabase/migrations/036_dashboard_schema_fixes.sql'), 'utf8');
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
await pool.query(sql);
console.log('Migration 036 applied');
await pool.end();
