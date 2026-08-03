import pg from "pg";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const email = (process.argv[2] || "smd49881@gmail.com").trim().toLowerCase();
const forcedTenantId = process.argv[3]?.trim() || null;
const envPath = join(dirname(fileURLToPath(import.meta.url)), "../apps/gateway/.env");
const env = readFileSync(envPath, "utf8");
const url = env.match(/^GATEWAY_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) {
  console.error("GATEWAY_DATABASE_URL not found in apps/gateway/.env");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const before = await pool.query(
  `SELECT u.email,
          u.raw_user_meta_data->>'tenant_id' AS meta_tenant,
          vt.id AS tenant_id,
          vt.company_name,
          s.plan,
          s.status,
          s.current_period_end
   FROM auth.users u
   LEFT JOIN public.voice_tenants vt
     ON vt.owner_user_id = u.id
     OR vt.id::text = u.raw_user_meta_data->>'tenant_id'
   LEFT JOIN public.subscriptions s ON s.tenant_id = vt.id
   WHERE lower(u.email) = $1`,
  [email]
);

console.log("BEFORE:", JSON.stringify(before.rows, null, 2));

const row = before.rows[0];
if (!row) {
  console.error(`No user found for ${email}`);
  await pool.end();
  process.exit(1);
}

const tenantId = forcedTenantId || row.meta_tenant || row.tenant_id;
if (!tenantId) {
  console.error("No tenant linked to this user");
  await pool.end();
  process.exit(1);
}
console.log("Updating tenant:", tenantId);

await pool.query(
  `UPDATE auth.users
   SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
     'tenant_id', $2::text,
     'tier', 'ENTERPRISE'
   )
   WHERE lower(email) = $1`,
  [email, tenantId]
);

await pool.query(
  `INSERT INTO public.subscriptions (
     tenant_id, plan, status, current_period_start, current_period_end
   ) VALUES ($1, 'enterprise', 'active', NOW(), NOW() + INTERVAL '1 year')
   ON CONFLICT (tenant_id) DO UPDATE SET
     plan = 'enterprise',
     status = 'active',
     current_period_start = NOW(),
     current_period_end = NOW() + INTERVAL '1 year',
     updated_at = NOW()`,
  [tenantId]
);

await pool.query(
  `UPDATE public.voice_tenants
   SET billing_block_reason = NULL, updated_at = NOW()
   WHERE id = $1`,
  [tenantId]
);

const after = await pool.query(
  `SELECT u.email, vt.id AS tenant_id, vt.company_name, s.plan, s.status, s.current_period_end
   FROM auth.users u
   LEFT JOIN public.voice_tenants vt
     ON vt.owner_user_id = u.id
     OR vt.id::text = u.raw_user_meta_data->>'tenant_id'
   LEFT JOIN public.subscriptions s ON s.tenant_id = vt.id
   WHERE lower(u.email) = $1`,
  [email]
);

console.log("AFTER:", JSON.stringify(after.rows, null, 2));
await pool.end();
