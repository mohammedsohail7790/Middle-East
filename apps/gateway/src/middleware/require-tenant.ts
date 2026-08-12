import type { Request, Response, NextFunction } from 'express';
import {
  attachTenantContext,
  isV4ZeroTrustEnabled,
  type CallIqAuthenticatedRequest,
} from '../services/auth/tenant-context.js';
import { verifyUserBearerToken } from '../services/auth/jwt-tenant-verifier.js';
import { verifyInternalServiceRequest } from '../services/auth/internal-service-auth.js';
import { verifySseDashboardToken } from '../security/sse-token.js';

/**
 * Zero-trust tenant middleware (Halla AI V4).
 * Sets req.tenant from verified JWT or scoped internal service key.
 */
export async function requireTenant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const internalApiKey = String(req.header('x-internal-api-key') || '');
  const authHeader = String(req.header('authorization') || '');
  const clientTenantHeader = req.header('x-tenant-id');
  const queryToken =
    typeof (req as Request & { query?: { token?: string } }).query?.token === 'string'
      ? (req as Request & { query?: { token?: string } }).query!.token
      : undefined;

  if (internalApiKey && process.env.VOICE_INTERNAL_API_KEY) {
    const internal = verifyInternalServiceRequest({
      apiKey: internalApiKey,
      tenantIdHeader: clientTenantHeader || undefined,
      scopesHeader: req.header('x-internal-scopes') || undefined,
      timestampHeader: req.header('x-service-timestamp') || undefined,
      signatureHeader: req.header('x-service-signature') || undefined,
    });
    if ('error' in internal) {
      res.status(internal.status).json({ success: false, error: internal.error });
      return;
    }
    attachTenantContext(req, {
      id: internal.tenantId,
      source: 'internal_service',
      scopes: internal.scopes,
    });
    next();
    return;
  }

  if (!authHeader.startsWith('Bearer ') && queryToken) {
    const sse = verifySseDashboardToken(queryToken);
    if (sse) {
      if (
        isV4ZeroTrustEnabled() &&
        clientTenantHeader &&
        clientTenantHeader !== sse.tenantId
      ) {
        res.status(403).json({
          success: false,
          error: 'Tenant scope mismatch — stream token does not match tenant header',
        });
        return;
      }
      attachTenantContext(req, {
        id: sse.tenantId,
        source: 'user_jwt',
      });
      next();
      return;
    }
  }

  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : queryToken || '';

  const verified = await verifyUserBearerToken(bearer);
  if ('error' in verified) {
    const message =
      !authHeader.startsWith('Bearer ') && queryToken
        ? 'Invalid or expired stream token — refresh the page'
        : verified.error;
    res.status(verified.status).json({ success: false, error: message });
    return;
  }

  if (isV4ZeroTrustEnabled() && clientTenantHeader && clientTenantHeader !== verified.tenantId) {
    res.status(403).json({
      success: false,
      error: 'Tenant scope mismatch — client tenant header ignored; use JWT tenant claim',
    });
    return;
  }

  if (!isV4ZeroTrustEnabled() && clientTenantHeader && clientTenantHeader !== verified.tenantId) {
    res.status(403).json({ success: false, error: 'Tenant scope mismatch' });
    return;
  }

  attachTenantContext(req, {
    id: verified.tenantId,
    userId: verified.userId,
    source: 'user_jwt',
  });

  const r = req as CallIqAuthenticatedRequest;
  if (r.requestId) {
    res.setHeader('X-Request-ID', r.requestId);
  }

  next();
}

/** Re-export for routers still importing from voice/security */
export { requireTenant as requireVoiceApiAccessV4 };
