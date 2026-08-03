import type { Request, Response, NextFunction } from 'express';
import type { CallIqAuthenticatedRequest } from '../services/auth/tenant-context.js';
import { getTenantId } from '../services/auth/tenant-context.js';

type Bucket = { count: number; resetsAt: number };

const tenantBuckets = new Map<string, Bucket>();
const ipBuckets = new Map<string, Bucket>();

function normalizeIp(ip?: string): string {
  return (ip || '').replace('::ffff:', '').trim() || 'unknown';
}

function checkBucket(
  map: Map<string, Bucket>,
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const current = map.get(key);
  if (!current || now > current.resetsAt) {
    map.set(key, { count: 1, resetsAt: now + windowMs });
    return { allowed: true };
  }
  if (current.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((current.resetsAt - now) / 1000),
    };
  }
  current.count += 1;
  map.set(key, current);
  return { allowed: true };
}

/**
 * Per-tenant + per-IP rate limiting for authenticated API routes.
 */
export function tenantRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const path = req.path || '';
  if (
    path.startsWith('/voice/incoming-call') ||
    path.startsWith('/voice/stream-status') ||
    path.startsWith('/voice/recording-status')
  ) {
    next();
    return;
  }

  const windowMs = Number(process.env.TENANT_RATE_LIMIT_WINDOW_MS || 60_000);
  const maxPerTenant = Number(process.env.TENANT_RATE_LIMIT_MAX || 300);
  const maxPerIp = Number(process.env.IP_RATE_LIMIT_MAX || 120);

  let tenantKey = 'anonymous';
  try {
    const r = req as CallIqAuthenticatedRequest;
    if (r.tenant?.id) tenantKey = r.tenant.id;
    else if (r.resolvedTenantId) tenantKey = r.resolvedTenantId;
    else tenantKey = getTenantId(req);
  } catch {
    tenantKey = 'anonymous';
  }

  const ip = normalizeIp(req.ip);
  const tenantCheck = checkBucket(tenantBuckets, tenantKey, maxPerTenant, windowMs);
  if (!tenantCheck.allowed) {
    res.status(429).json({
      success: false,
      error: 'Tenant rate limit exceeded',
      retryAfterSeconds: tenantCheck.retryAfterSec,
    });
    return;
  }

  const ipCheck = checkBucket(ipBuckets, ip, maxPerIp, windowMs);
  if (!ipCheck.allowed) {
    res.status(429).json({
      success: false,
      error: 'IP rate limit exceeded',
      retryAfterSeconds: ipCheck.retryAfterSec,
    });
    return;
  }

  next();
}
