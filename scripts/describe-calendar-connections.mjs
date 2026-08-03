import pg from "pg";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "../apps/gateway/.env");
const env = readFileSync(envPath, "utf8");
const url = env.match(/^GATEWAY_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) {
  console.error("GATEWAY_DATABASE_URL not found in apps/gateway/.env");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const r = await pool.query(
  `SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'calendar_connections'
   ORDER BY ordinal_position`
);
console.log(JSON.stringify(r.rows, null, 2));
await pool.end();

