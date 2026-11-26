/**
 * One-time backfill: encrypts the Google Calendar tokens that were saved as plain text before token encryption was added.
 *
 *   GATEWAY_DATABASE_URL=... INTEGRATION_CREDENTIALS_KEY=... npx tsx apps/gateway/scripts/encrypt-google-tokens.ts           (dry run: only counts, changes nothing)
 *   GATEWAY_DATABASE_URL=... INTEGRATION_CREDENTIALS_KEY=... npx tsx apps/gateway/scripts/encrypt-google-tokens.ts --apply   (encrypts)
 *
 * Use the SAME INTEGRATION_CREDENTIALS_KEY as the live gateway, otherwise the live gateway cannot read what this writes.
 * Safe to run again: a value that is already encrypted is skipped. Tokens are never printed.
 * Run it only after the gateway version that can read encrypted tokens is deployed.
 */
import pg from 'pg';
import { GOOGLE_TOKEN_PREFIX, encryptGoogleToken } from '../src/services/calendar/google-token-crypto.js';

const apply = process.argv.includes('--apply');
const url = process.env.GATEWAY_DATABASE_URL;
if (!url) {
  console.error('Set GATEWAY_DATABASE_URL.');
  process.exit(1);
}
if (!process.env.INTEGRATION_CREDENTIALS_KEY) {
  console.error('Set INTEGRATION_CREDENTIALS_KEY (the same value as on the live gateway).');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

type Target = { label: string; table: string; where: string; columns: string[] };
const targets: Target[] = [
  { label: 'calendar_connections', table: 'public.calendar_connections', where: `provider = 'google'`, columns: ['access_token', 'refresh_token'] },
  { label: 'voice_tenants', table: 'public.voice_tenants', where: 'TRUE', columns: ['google_access_token', 'google_refresh_token'] },
];

const needsEncrypting = (v: unknown) => typeof v === 'string' && v.trim() !== '' && !v.startsWith(GOOGLE_TOKEN_PREFIX);

try {
  for (const t of targets) {
    const rows = (await pool.query(`SELECT id, ${t.columns.join(', ')} FROM ${t.table} WHERE ${t.where}`)).rows as Array<Record<string, unknown>>;
    let plain = 0;
    let done = 0;
    for (const row of rows) {
      const changes: Record<string, string> = {};
      for (const col of t.columns) {
        if (needsEncrypting(row[col])) {
          plain += 1;
          const enc = encryptGoogleToken(row[col] as string);
          if (enc) changes[col] = enc;
        }
      }
      if (apply && Object.keys(changes).length) {
        const cols = Object.keys(changes);
        await pool.query(
          `UPDATE ${t.table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
          [row.id, ...cols.map((c) => changes[c])]
        );
        done += cols.length;
      }
    }
    console.log(`${t.label}: ${rows.length} rows, ${plain} plain-text token values${apply ? `, ${done} encrypted now` : ' (dry run, nothing changed)'}`);
  }
} finally {
  await pool.end();
}
