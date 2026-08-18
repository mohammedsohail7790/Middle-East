import fs from 'fs';
import pg from 'pg';

const file = process.argv[2];
if (!file || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL=... node scripts/apply-sql-file.mjs <sql-file>');
  process.exit(1);
}

const sql = fs.readFileSync(file, 'utf8');
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`Applying ${file} (${sql.length} bytes)...`);
  await client.query(sql);
  console.log('Done.');
} catch (e) {
  console.error('Failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
