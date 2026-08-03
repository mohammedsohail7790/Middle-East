#!/usr/bin/env node
/**
 * Sync supabase_migrations.schema_migrations after migration file renames.
 * Run once against production/staging when duplicate-prefix files were renamed to 052–056.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/sync-migration-history.mjs
 *   node scripts/sync-migration-history.mjs --dry-run
 */
import pg from 'pg';

const RENAMES = [
  ['010_calendar_connections_google.sql', '052_calendar_connections_google.sql'],
  ['017_minutes_accounting_duration_seconds.sql', '053_minutes_accounting_duration_seconds.sql'],
  ['018_call_costs.sql', '054_call_costs.sql'],
  ['019_onboarding_progress.sql', '055_onboarding_progress.sql'],
  ['020_fix_knowledge_files.sql', '056_fix_knowledge_files.sql'],
];

const dryRun = process.argv.includes('--dry-run');
const dbUrl = process.env.DATABASE_URL || process.env.GATEWAY_DATABASE_URL;

if (!dbUrl?.trim()) {
  console.error('Set DATABASE_URL or GATEWAY_DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: dbUrl.replace(/^postgresql\+asyncpg:\/\//, 'postgresql://'),
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: true },
});

async function tableExists() {
  const { rows } = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
    LIMIT 1
  `);
  return rows.length > 0;
}

async function main() {
  if (!(await tableExists())) {
    console.log('supabase_migrations.schema_migrations not found — fresh install; no sync needed.');
    await pool.end();
    return;
  }

  for (const [oldName, newName] of RENAMES) {
    const { rows } = await pool.query(
      `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1`,
      [oldName]
    );
    if (rows.length === 0) {
      console.log(`[skip] ${oldName} not in history`);
      continue;
    }
    const { rows: existsNew } = await pool.query(
      `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1`,
      [newName]
    );
    if (existsNew.length > 0) {
      console.log(`[skip] ${newName} already recorded — remove duplicate ${oldName} manually if needed`);
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] UPDATE version ${oldName} → ${newName}`);
    } else {
      await pool.query(
        `UPDATE supabase_migrations.schema_migrations SET version = $2 WHERE version = $1`,
        [oldName, newName]
      );
      console.log(`[ok] Renamed migration record: ${oldName} → ${newName}`);
    }
  }

  await pool.end();
  console.log(dryRun ? 'Dry run complete.' : 'Migration history sync complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
