/**
 * Create or verify a tenant — requires DATABASE_URL in environment.
 * Usage: DATABASE_URL=postgresql://... node create-tenant.js
 */
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.GATEWAY_DATABASE_URL;
if (!connectionString) {
  console.error('Set DATABASE_URL or GATEWAY_DATABASE_URL');
  process.exit(1);
}

const phone = process.env.TENANT_PHONE || '+10000000000';
const tenantId = process.env.TENANT_ID;

const client = new pg.Client({
  connectionString,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const check = await client.query(
    `SELECT id, company_name, phone_number FROM public.voice_tenants
     WHERE phone_number = $1 OR ($2::uuid IS NOT NULL AND id = $2::uuid)`,
    [phone, tenantId || null]
  );
  if (check.rows.length) {
    console.log('Tenant exists:', check.rows[0]);
  } else {
    console.log('No tenant found for', phone, '— create via dashboard onboarding or SQL migration.');
  }
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
