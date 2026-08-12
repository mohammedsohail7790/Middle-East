import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const root = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(root, '../apps/gateway/.env'), 'utf8');
const url = env.match(/^GATEWAY_DATABASE_URL=(.+)$/m)?.[1]?.trim();
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const tenant = await pool.query(`SELECT id FROM public.voice_tenants LIMIT 1`);
const tenantId = tenant.rows[0]?.id;
if (!tenantId) {
  console.error('No tenant found');
  process.exit(1);
}

const state = randomBytes(16).toString('hex');
await pool.query(
  `INSERT INTO public.integration_oauth_states (state, tenant_id, provider, redirect_uri, code_verifier, expires_at)
   VALUES ($1, $2, 'hubspot', 'https://example.com/cb', 'https://www.hallaai.com', NOW() + INTERVAL '10 minutes')`,
  [state, tenantId]
);
await pool.query(`DELETE FROM public.integration_oauth_states WHERE state = $1`, [state]);
console.log('INSERT/DELETE OK for tenant', tenantId);
await pool.end();
