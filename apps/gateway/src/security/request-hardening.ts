/**
 * OWASP-aligned request hardening (prototype pollution, oversized inputs, shallow XSS trim).
 * Applied globally after JSON parsing — does not replace per-route schema validation.
 */
import type { Request, Response, NextFunction } from 'express';

/** Keys that must never appear in user-controlled JSON (prototype pollution). */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_QUERY_STRING_LEN = Number(process.env.MAX_QUERY_STRING_LEN || 2000);
const MAX_BODY_KEY_COUNT = Number(process.env.MAX_BODY_KEY_COUNT || 200);

function hasDangerousKeys(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = hasDangerousKeys(item, depth + 1);
      if (nested) return nested;
    }
    return null;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) return key;
    const nested = hasDangerousKeys((value as Record<string, unknown>)[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

/** Shallow string sanitization — strips common reflected-XSS patterns from string fields. */
function sanitizeShallow(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }
  if (Array.isArray(obj)) return obj.map(sanitizeShallow);
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!DANGEROUS_KEYS.has(k)) out[k] = sanitizeShallow(v);
    }
    return out;
  }
  return obj;
}

/**
 * Reject prototype-pollution keys, cap query string length, and shallow-sanitize body/query.
 */
export function requestHardeningMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.query && typeof req.query === 'object') {
    for (const [key, raw] of Object.entries(req.query)) {
      if (DANGEROUS_KEYS.has(key)) {
        res.status(400).json({ success: false, error: 'Invalid query parameter', field: key });
        return;
      }
      const val = Array.isArray(raw) ? raw.join(',') : String(raw ?? '');
      if (val.length > MAX_QUERY_STRING_LEN) {
        res.status(400).json({
          success: false,
          error: `Query parameter "${key}" exceeds maximum length (${MAX_QUERY_STRING_LEN})`,
        });
        return;
      }
    }
    (req as { query?: unknown }).query = sanitizeShallow(req.query) as typeof req.query;
  }

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const keys = Object.keys(req.body as object);
    if (keys.length > MAX_BODY_KEY_COUNT) {
      res.status(400).json({
        success: false,
        error: `Request body has too many fields (max ${MAX_BODY_KEY_COUNT})`,
      });
      return;
    }
    const dangerous = hasDangerousKeys(req.body);
    if (dangerous) {
      res.status(400).json({ success: false, error: 'Invalid request body', field: dangerous });
      return;
    }
    (req as { body?: unknown }).body = sanitizeShallow(req.body);
  }

  next();
}
