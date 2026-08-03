#!/usr/bin/env node
/**
 * Validates that migration files have no duplicate number prefixes.
 * Run: node scripts/validate-migrations.mjs
 * Used in CI to prevent duplicate migration numbers.
 */
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');

const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

const prefixMap = new Map();
const errors = [];

for (const file of files) {
  const match = file.match(/^(\d+)_/);
  if (!match) continue;
  const prefix = match[1];
  if (prefixMap.has(prefix)) {
    errors.push(`DUPLICATE migration prefix ${prefix}: "${prefixMap.get(prefix)}" and "${file}"`);
  } else {
    prefixMap.set(prefix, file);
  }
}

if (errors.length > 0) {
  console.error('Migration validation FAILED:');
  errors.forEach(e => console.error(`  ${e}`));
  process.exit(1);
} else {
  console.log(`Migration validation passed -- ${files.length} migrations, no duplicates`);
}
