import dotenv from 'dotenv';
import { resolve } from 'path';
import { redisEndpointForLog } from './services/redis-connection.js';

// Initialize Sentry error monitoring early — before any imports that might fail
import('./observability/sentry.js').then(({ initializeSentry }) => {
  initializeSentry({
    dsn: process.env.SENTRY_DSN || '',
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || process.env.RENDER_GIT_COMMIT?.slice(0, 8) || 'dev',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.0'),
    enabled: Boolean(process.env.SENTRY_DSN),
  });
}).catch((err: Error) => {
  process.stderr.write(`[bootstrap] Sentry init failed: ${err.message}\n`);
});

if (process.env.NODE_ENV === 'production') {
  import('./services/auth/ws-session-tokens.js').then(({ assertWsSessionSecret }) => {
    assertWsSessionSecret();
  }).catch((err: Error) => {
    process.stderr.write(`[bootstrap] FATAL: ${err.message}\n`);
    process.exit(1);
  });
}

// Disable SSL certificate validation only in local development when explicitly enabled.
// Never set this in staging or production — use proper CA certificates instead.
if (
    process.env.NODE_ENV !== 'production'
    && process.env.NODE_ENV !== 'staging'
    && process.env.ALLOW_INSECURE_TLS === 'true'
) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    process.stderr.write('[bootstrap] WARNING: TLS certificate validation disabled (ALLOW_INSECURE_TLS=true)\n');
}

// Load .env from the gateway directory
const envPath = resolve(process.cwd(), '.env');
const result = dotenv.config({ path: envPath });
if (result.error && (result.error as any).code !== 'ENOENT') {
    // .env load failure is a warning, not fatal — env vars may be set by the platform
    process.stderr.write(`[bootstrap] Warning: failed to load .env: ${result.error.message}\n`);
}

// Structured startup log (no emojis, no secrets)
const redisConfigured = Boolean(process.env.REDIS_URL);
const redisEndpoint = process.env.REDIS_URL ? redisEndpointForLog(process.env.REDIS_URL) : 'not-set';
process.stdout.write(
    JSON.stringify({
        level: 'info',
        msg: 'gateway_bootstrap',
        env: process.env.NODE_ENV || 'development',
        redis_configured: redisConfigured,
        redis_endpoint: redisEndpoint,
        ts: new Date().toISOString(),
    }) + '\n'
);
