/**
 * MFA Enforcement Middleware
 *
 * When a tenant's org_auth_policy has mfa_required = true this middleware
 * blocks requests from sessions that have not completed MFA verification.
 *
 * It is mounted on the apiRouter AFTER apiAuthUnlessPublic so that
 * req.resolvedTenantId and req.userId are already set.
 *
 * HIPAA §164.312(d) — Person/entity authentication.
 */

import type { Request, Response, NextFunction } from 'express';
import { getOrgAuthPolicy } from '../services/enterprise-auth/org-auth-policy.js';
import { voiceDb } from '../services/voice/tenant-scope.js';
import { logger } from '../services/logger.js';
import type { CallIqAuthenticatedRequest } from '../services/auth/tenant-context.js';

/**
 * Routes that are always exempt from the MFA gate (e.g. MFA setup/verify itself,
 * logout, and health probes).
 */
function isMfaExempt(path: string, method: string): boolean {
  // MFA challenge / verify endpoints — user needs to pass through to complete MFA
  if (/\/(mfa|auth)\/(verify|challenge|totp|setup|enroll)(\/|$)/i.test(path)) return true;
  // Billing plan reads are public
  if (method === 'GET' && /^\/billing\/(plans|plan-definitions|status)(\/|$)/.test(path)) return true;
  // Dashboard SSE token / CSRF token — needed to load the dashboard before gating
  if (/\/dashboard\/(sse-token|csrf-token)(\/|$)/.test(path)) return true;
  return false;
}

/**
 * Look up the enterprise session to check mfa_verified.
 * Returns true if the session has been MFA-verified, false otherwise.
 * Falls through (returns true) if no enterprise session is found so that
 * non-enterprise tenants without sessions are not blocked.
 */
async function isSessionMfaVerified(tenantId: string, userId: string): Promise<boolean> {
  try {
    const r = await voiceDb.query(
      `SELECT mfa_verified FROM public.enterprise_auth_sessions
       WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL
       ORDER BY last_seen_at DESC
       LIMIT 1`,
      [tenantId, userId]
    );
    if (r.rows.length === 0) {
      // No enterprise session — allow through (handled by Supabase session only)
      return true;
    }
    return Boolean(r.rows[0].mfa_verified);
  } catch (err) {
    logger.warn('MFA_SESSION_CHECK_ERROR', { tenantId, userId, error: String(err) });
    // Fail open on DB error to avoid blocking legitimate requests during outages.
    // Log clearly so the issue is visible.
    return true;
  }
}

export function enforceMfaMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip preflight
  if (req.method === 'OPTIONS') { next(); return; }

  const r = req as CallIqAuthenticatedRequest;
  const tenantId = r.resolvedTenantId || r.tenant?.id;
  const userId = r.user?.id || (r as any).userId;

  // No tenant context — auth middleware will handle this
  if (!tenantId || !userId) { next(); return; }

  const rawPath = (req.originalUrl?.split('?')[0] || req.path || '')
    .replace(/^\/api\/v1/, '')
    .replace(/^\/api/, '');

  if (isMfaExempt(rawPath, req.method)) { next(); return; }

  void (async () => {
    try {
      const policy = await getOrgAuthPolicy(tenantId);

      if (!policy.mfaRequired) {
        next();
        return;
      }

      const verified = await isSessionMfaVerified(tenantId, userId);
      if (verified) {
        next();
        return;
      }

      logger.warn('MFA_REQUIRED_NOT_VERIFIED', { tenantId, userId, path: rawPath });
      res.status(403).json({
        success: false,
        error: 'Multi-factor authentication required. Please complete MFA to continue.',
        code: 'MFA_REQUIRED',
      });
    } catch (err) {
      logger.error('MFA_MIDDLEWARE_ERROR', { tenantId, userId, error: String(err) });
      // Fail open — do not block on unexpected errors
      next();
    }
  })();
}
