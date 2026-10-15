import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { CallIqAuthenticatedRequest } from '../services/auth/tenant-context.js';
import { voiceRedis } from '../services/voice/redis.client.js';

type Bucket = { count: number; resetsAt: number };

const memoryBuckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;

function normalizeIp(ip?: string): string {
  return (ip || '').replace('::ffff:', '').trim() || 'unknown';
}

function isAuthRoute(path: string): boolean {
  return /\/(auth|login|signup|sign-up|password|reset-password|otp|verify|magic-link)/i.test(path);
}

function isLlmHeavyRoute(path: string, method: string): boolean {
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return false;
  // Settings saves hit PUT /ai-config often — do not bucket with LLM (10/min).
  if (method === 'PUT' && /\/ai-config\/?$/i.test(path)) return false;
  return (
    /\/(knowledge|ingest|test-voice|realtime|openai|dashboard-assistant)/i.test(path) ||
    /\/ai-config\/(test|test-voice)/i.test(path) ||
    path.includes('/voice/incoming-call')
  );
}

function isPublicWebhook(path: string, method: string): boolean {
  return (
    method === 'POST' &&
    (/^\/voice\/(incoming-call|outbound-answer|call-status|stream-status|recording-status|test-outbound-twiml|consent-response)/.test(path) ||
      /\/webhook(\/|$)/.test(path))
  );
}

/** Unauthenticated billing catalog reads (no tenant header required). */
function isPublicBillingRead(path: string, method: string): boolean {
  return (
    method === 'GET' &&
    /^\/billing\/(plans|plan-definitions|status)(\/|$)/.test(path)
  );
}

/**
 * Klaros's backend calls Halla server-to-server (provision / phone / refresh) with the platform secret,
 * so these requests carry no tenant and would otherwise land in the anonymous per-IP bucket. Every Klaros
 * business shares one egress IP, so that bucket (20/min) throttles provisioning ("Halla is rate limiting
 * Klaros"). The route authenticates itself and has its own in-process limiter; give it a dedicated bucket.
 */
export function isPlatformServerRoute(path: string): boolean {
  return /^\/platform\/klaros\//.test(path);
}

/** Stable per-user bucket from Bearer token (no JWT decode — avoids auth bypass). */
function getBearerUserKey(req: Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  return createHash('sha256').update(token).digest('hex').slice(0, 24);
}

/** Long-lived dashboard streams and short-lived token minting — still auth-gated upstream. */
function isRealtimeDashboardRoute(path: string, method: string): boolean {
  if (method !== 'GET') return false;
  return (
    /\/dashboard\/(sse-token|stream|csrf-token)/.test(path) ||
    /\/ai-config\/ws-token/.test(path)
  );
}

/**
 * Count one request AND guarantee the counter has an expiry, in a single atomic Redis step.
 *
 * Doing INCR and then PEXPIRE as two separate commands is not safe: if the process dies, the connection drops, or Redis fails over between them, the key is left with
 * no expiry. Its count then only ever grows, so every later request from that address is refused with 429 until someone deletes the key by hand. (That is how a caller can
 * be "rate limited" for many hours.) The script also repairs a counter that is already stuck: a key with no expiry (PTTL < 0) gets one on its next request.
 */
const COUNT_AND_EXPIRE = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

async function incrRedis(key: string, windowMs: number): Promise<{ count: number; ttlMs: number } | null> {
  try {
    const result = (await voiceRedis.eval(COUNT_AND_EXPIRE, 1, `rl:${key}`, String(windowMs))) as [number, number];
    const count = Number(result[0]);
    const ttlMs = Number(result[1]);
    return { count, ttlMs: ttlMs > 0 ? ttlMs : windowMs };
  } catch {
    return null; // Redis unavailable: the caller falls back to the in-memory bucket
  }
}

function incrMemory(key: string, max: number, windowMs: number): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const current = memoryBuckets.get(key);
  if (!current || now > current.resetsAt) {
    memoryBuckets.set(key, { count: 1, resetsAt: now + windowMs });
    return { allowed: true };
  }
  if (current.count >= max) {
    return { allowed: false, retryAfterSec: Math.ceil((current.resetsAt - now) / 1000) };
  }
  current.count += 1;
  memoryBuckets.set(key, current);
  return { allowed: true };
}

export async function checkLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const redisResult = await incrRedis(key, windowMs);
  if (redisResult) {
    if (redisResult.count > max) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil(redisResult.ttlMs / 1000)),
      };
    }
    return { allowed: true };
  }
  return incrMemory(key, max, windowMs);
}

export function respond429(res: Response, retryAfterSec: number): void {
  res.setHeader('Retry-After', String(retryAfterSec));
  res.setHeader('X-RateLimit-Remaining', '0');
  res.status(429).json({
    success: false,
    error: 'Too many requests. Please try again later.',
    retryAfterSeconds: retryAfterSec,
  });
}

/**
 * Tiered sliding-window limits (per minute):
 * - Public/webhooks: 20 / IP
 * - Auth-shaped routes: 5 / IP
 * - LLM-heavy POST: 10 / tenant or IP
 * - Authenticated API: 180 / tenant (IP cap only for anonymous — avoids Vercel proxy shared egress)
 */
function requestPath(req: Request): string {
  const raw = req.originalUrl?.split('?')[0] || req.path || '';
  return raw.replace(/^\/api\/v1/, '').replace(/^\/api/, '') || raw;
}

export async function tieredRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const path = requestPath(req);
  const method = req.method || 'GET';
  const ip = normalizeIp(req.ip);

  const r = req as CallIqAuthenticatedRequest;
  const tenantId = r.tenant?.id || r.resolvedTenantId || req.header('x-tenant-id') || '';

  let max: number;
  let key: string;

  if (isRealtimeDashboardRoute(path, method)) {
    // Separate bucket so redeploy reconnect storms do not exhaust the general API quota.
    max = Number(process.env.RATE_LIMIT_REALTIME_PER_MIN || 600);
    key = tenantId ? `rt:${tenantId}` : `rt:${ip}`;
  } else if (isPlatformServerRoute(path)) {
    max = Number(process.env.RATE_LIMIT_PLATFORM_PER_MIN || 120);
    key = `platform:${ip}`;
  } else if (isPublicWebhook(path, method)) {
    // Provider webhooks (Twilio, Stripe, Slack, SMS) — higher ceiling, still IP-bound.
    max = Number(process.env.RATE_LIMIT_WEBHOOK_PER_MIN || 120);
    key = `wh:${ip}`;
  } else if (isPublicBillingRead(path, method)) {
    max = Number(process.env.RATE_LIMIT_PUBLIC_READ_PER_MIN || 60);
    key = `billing-read:${ip}`;
  } else if (isAuthRoute(path)) {
    max = Number(process.env.RATE_LIMIT_AUTH_PER_MIN || 5);
    key = `auth:${ip}`;
  } else if (isLlmHeavyRoute(path, method)) {
    max = Number(process.env.RATE_LIMIT_LLM_PER_MIN || 10);
    key = tenantId ? `llm:${tenantId}` : `llm:${ip}`;
  } else if (tenantId) {
    max = Number(process.env.RATE_LIMIT_USER_PER_MIN || 180);
    key = `user:${tenantId}`;
  } else {
    max = Number(process.env.RATE_LIMIT_PUBLIC_PER_MIN || 20);
    key = `anon:${ip}`;
  }

  const primary = await checkLimit(key, max, WINDOW_MS);
  if (!primary.allowed) {
    respond429(res, primary.retryAfterSec || 60);
    return;
  }

  // Authenticated traffic is keyed by tenant; do not also cap shared proxy egress (e.g. Vercel → Render).
  if (!tenantId && !isPublicWebhook(path, method) && !isPlatformServerRoute(path)) {
    const ipCap = await checkLimit(`ip:${ip}`, Number(process.env.IP_RATE_LIMIT_MAX || 120), WINDOW_MS);
    if (!ipCap.allowed) {
      respond429(res, ipCap.retryAfterSec || 60);
      return;
    }
  }

  // Secondary IP cap for authenticated dashboard traffic (shared egress protection).
  if (tenantId) {
    const authIpCap = await checkLimit(
      `auth-ip:${ip}`,
      Number(process.env.RATE_LIMIT_AUTH_IP_PER_MIN || 300),
      WINDOW_MS
    );
    if (!authIpCap.allowed) {
      respond429(res, authIpCap.retryAfterSec || 60);
      return;
    }
  }

  // Per-user cap when a Bearer token is present (Supabase JWT / session).
  const bearerUserKey = getBearerUserKey(req);
  if (bearerUserKey) {
    const userCap = await checkLimit(
      `bearer:${bearerUserKey}`,
      Number(process.env.RATE_LIMIT_BEARER_USER_PER_MIN || 300),
      WINDOW_MS
    );
    if (!userCap.allowed) {
      respond429(res, userCap.retryAfterSec || 60);
      return;
    }
  }

  next();
}

/** Rate limit for non-/api public routes: /, /health, /ready, /stats */
export async function publicRootRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = normalizeIp(req.ip);
  const max = Number(process.env.RATE_LIMIT_HEALTH_PER_MIN || 120);
  const result = await checkLimit(`root:${ip}`, max, WINDOW_MS);
  if (!result.allowed) {
    respond429(res, result.retryAfterSec || 60);
    return;
  }
  next();
}

/** Stripe billing webhook is registered before /api tiered limiter — apply the same webhook bucket. */
export async function inboundWebhookRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = normalizeIp(req.ip);
  const max = Number(process.env.RATE_LIMIT_WEBHOOK_PER_MIN || 120);
  const result = await checkLimit(`wh:${ip}`, max, WINDOW_MS);
  if (!result.allowed) {
    respond429(res, result.retryAfterSec || 60);
    return;
  }
  next();
}
