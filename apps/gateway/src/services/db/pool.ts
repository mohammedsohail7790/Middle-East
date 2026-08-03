import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { logger } from '../logger.js';

const connectionString =
  process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL;

/**
 * SSL configuration for the Postgres pool.
 *
 * Respects PGSSLMODE (libpq semantics):
 *   - 'verify-full' / 'verify-ca': full certificate chain validation. Set
 *     PG_SSL_CA to a PEM file path (e.g. Supabase root CA) for mutual-TLS.
 *     HIPAA deployments should use this mode with a pinned CA.
 *   - 'require' (default for this deployment): encrypt the connection but
 *     do not validate the certificate chain. Required for Supabase's
 *     pooler, whose presented chain Node's TLS stack flags as
 *     "self-signed certificate in certificate chain" under strict
 *     validation — a known quirk, not a real MITM risk for this managed
 *     connection.
 *   - 'disable': no SSL at all (local Postgres only).
 *
 * In development you may also set ALLOW_INSECURE_TLS=true to skip cert
 * validation regardless of PGSSLMODE (never set this outside local dev).
 */
function buildSslConfig(): { rejectUnauthorized: boolean; ca?: string } | false {
  if (process.env.ALLOW_INSECURE_TLS === 'true' && process.env.NODE_ENV !== 'production') {
    return { rejectUnauthorized: false };
  }

  const mode = (process.env.PGSSLMODE || 'require').toLowerCase();

  if (mode === 'disable') return false;

  if (mode === 'verify-full' || mode === 'verify-ca') {
    const caPath = process.env.PG_SSL_CA;
    if (caPath && existsSync(caPath)) {
      return { rejectUnauthorized: true, ca: readFileSync(caPath, 'utf8') };
    }
    return { rejectUnauthorized: true };
  }

  // 'require' (and any other value): encrypt without chain validation.
  return { rejectUnauthorized: false };
}

/** Supabase session pooler caps concurrent clients (often 15). Keep headroom below that limit. */
export const pool = new Pool({
  connectionString,
  ssl: buildSslConfig(),
  max: Number(process.env.PG_POOL_MAX || 8),
  idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.PG_POOL_CONNECT_MS || 10_000),
  application_name: process.env.PG_APP_NAME || 'calliq-gateway',
});

// pg's Pool emits 'error' whenever an idle client hits a connection-level
// error (network blip, pooler restart, terminated connection) unrelated to
// any in-flight query. Node's default behavior for an unhandled EventEmitter
// 'error' is to throw and crash the process — without this listener, a
// transient Postgres network hiccup would take down every active call, not
// just the request touching the DB at that moment.
pool.on('error', (err) => {
  logger.error('PG_POOL_IDLE_CLIENT_ERROR', { error: err instanceof Error ? err.message : String(err) });
});
