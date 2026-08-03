/**
 * Inspect voice_tenants schema — requires DATABASE_URL in environment.
 */
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.GATEWAY_DATABASE_URL;
if (!connectionString) {
  console.error('Set DATABASE_URL or GATEWAY_DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});

async function checkTenants() {
  const client = await pool.connect();
  const columns = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'voice_tenants'
    ORDER BY ordinal_position
  `);
  console.log('voice_tenants columns:', columns.rows.length);
  const sample = await client.query(
    `SELECT id, company_name, phone_number, created_at FROM public.voice_tenants ORDER BY created_at DESC LIMIT 5`
  );
  console.log('Recent tenants:', sample.rows);
  client.release();
  await pool.end();
}

checkTenants().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
