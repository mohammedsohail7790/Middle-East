import type { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { voiceRedis } from '../services/voice/redis.client.js';
import { verifyUserBearerToken } from '../services/auth/jwt-tenant-verifier.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_PREFIX = 'csrf:';
const CSRF_TTL_SEC = 3600;

/** In-memory fallback — only active in non-production to allow offline dev work */
const devMemoryCsrf = new Map<string, { token: string; expiresAt: number }>();

function useDevCsrfMemoryFallback(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.CSRF_MEMORY_FALLBACK === 'true';
}

function storeDevCsrf(userId: string, token: string): void {
  devMemoryCsrf.set(userId, {
    token,
    expiresAt: Date.now() + CSRF_TTL_SEC * 1000,
  });
}

function readDevCsrf(userId: string): string | null {
  const row = devMemoryCsrf.get(userId);
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    devMemoryCsrf.delete(userId);
    return null;
  }
  return row.token;
}

function pathsExemptFromCsrf(path: string): boolean {
  return (
    path.startsWith('/voice/') ||
    path.includes('/webhook') ||
    path.includes('/callback') ||
    path === '/billing/webhook' ||
    path === '/auth/csrf-token' ||
    path === '/tenants' ||
    path === '/tenants/' ||
    path.startsWith('/tenants/onboarding-status') ||
    path.startsWith('/onboarding/') ||
    path === '/team/sync-auth'
  );
}

export async function issueCsrfTokenForUser(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  try {
    await voiceRedis.setex(`${CSRF_PREFIX}${userId}`, CSRF_TTL_SEC, token);
    return token;
  } catch {
    if (useDevCsrfMemoryFallback()) {
      storeDevCsrf(userId, token);
      return token;
    }
    throw new Error('CSRF store unavailable — Redis connection required in production');
  }
}

function tokensMatch(stored: string, headerToken: string): boolean {
  if (!stored || !headerToken) return false;
  try {
    const a = Buffer.from(stored);
    const b = Buffer.from(headerToken);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function validateCsrf(userId: string, headerToken: string): Promise<boolean> {
  const stored = await voiceRedis.get(`${CSRF_PREFIX}${userId}`).catch(() => null);
  if (stored && tokensMatch(stored, headerToken)) return true;
  if (useDevCsrfMemoryFallback()) {
    const mem = readDevCsrf(userId);
    if (mem && tokensMatch(mem, headerToken)) return true;
  }
  return false;
}

/** CSRF for state-changing API calls authenticated with Bearer JWT. */
export async function csrfProtectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }

  const path = (req.originalUrl?.split('?')[0] || req.path || '').replace(/^\/api\/v1/, '');
  if (pathsExemptFromCsrf(path)) {
    next();
    return;
  }

  const internalKey = String(req.header('x-internal-api-key') || '');
  const configuredKey = process.env.VOICE_INTERNAL_API_KEY || '';
  if (internalKey && configuredKey) {
    const a = Buffer.from(configuredKey);
    const b = Buffer.from(internalKey.padEnd(configuredKey.length, '\0').slice(0, configuredKey.length));
    if (a.length === b.length && timingSafeEqual(a, b)) {
      next();
      return;
    }
  }

  const authHeader = String(req.header('authorization') || '');
  if (!authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const bearer = authHeader.slice(7);
  const verified = await verifyUserBearerToken(bearer);
  if ('error' in verified) {
    next();
    return;
  }

  const headerToken = String(req.header('x-csrf-token') || '');
  const ok = await validateCsrf(verified.userId, headerToken);
  if (!ok) {
    res.status(403).json({ success: false, error: 'CSRF validation failed' });
    return;
  }

  next();
}
