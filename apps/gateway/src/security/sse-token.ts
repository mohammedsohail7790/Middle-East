import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { logger } from '../services/logger.js';

export interface SseTokenClaims {
  sub: 'calliq-sse';
  tid: string;
  jti: string;
  iat?: number;
  exp?: number;
}

function trimSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/** All secrets that may verify dashboard SSE tokens (order matters for signing). */
export function sseSigningSecrets(): string[] {
  const raw = [
    process.env.JWT_SECRET,
    process.env.WS_SESSION_SECRET,
    process.env.VOICE_INTERNAL_API_KEY,
    process.env.JWT_SECRET_PREVIOUS,
  ].map(trimSecret).filter((s): s is string => Boolean(s));
  return [...new Set(raw)];
}

function primarySseSecret(): string {
  const secrets = sseSigningSecrets();
  if (secrets.length === 0) {
    throw new Error('JWT_SECRET (or VOICE_INTERNAL_API_KEY) required for SSE tokens');
  }
  return secrets[0];
}

const TTL_SEC = Number(process.env.SSE_TOKEN_TTL_SEC || 300);

export function issueSseDashboardToken(tenantId: string): string {
  const secret = primarySseSecret();
  const claims: SseTokenClaims = {
    sub: 'calliq-sse',
    tid: tenantId,
    jti: randomBytes(12).toString('hex'),
  };
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  return jwt.sign({ ...claims, exp }, secret);
}

export function verifySseDashboardToken(token: string): { tenantId: string } | null {
  const normalized = token?.trim();
  if (!normalized) return null;

  const secrets = sseSigningSecrets();
  if (secrets.length === 0) {
    logger.warn('[SSE] No signing secrets configured — cannot verify stream token');
    return null;
  }

  let lastError = '';
  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(normalized, secret) as SseTokenClaims;
      if (decoded.sub !== 'calliq-sse' || !decoded.tid) continue;
      return { tenantId: String(decoded.tid) };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  logger.warn('[SSE] Stream token verification failed', {
    reason: lastError.slice(0, 120),
    secretsConfigured: secrets.length,
  });
  return null;
}

export function sseTokenTtlSeconds(): number {
  return TTL_SEC;
}

/** Clear cached column layout after migrations (tests / ops). */
export function resetSseTokenCacheForTests(): void {
  /* no module-level cache today — reserved for future schema caches */
}
