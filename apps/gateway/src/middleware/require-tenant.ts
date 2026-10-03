import type { Request, Response, NextFunction } from 'express';
import {
  attachTenantContext,
  isV4ZeroTrustEnabled,
  type CallIqAuthenticatedRequest,
} from '../services/auth/tenant-context.js';
import { verifyUserBearerToken } from '../services/auth/jwt-tenant-verifier.js';
import { verifyInternalServiceRequest } from '../services/auth/internal-service-auth.js';
import { verifySseDashboardToken } from '../security/sse-token.js';
import { tenantApiKeyService } from '../services/api-keys/apiKey.service.js';
import { evaluateApiKeyPolicy } from '../security/api-key-scope-policy.js';

/** Tenant-scoped server-to-server credential prefix (e.g. Klaros). Distinct
 *  from the single shared x-internal-api-key secret — this key identifies
 *  exactly one tenant and carries its own scopes, enforced server-side. */
const TENANT_API_KEY_PREFIX = 'sk_calliq_';

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

  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (bearerToken.startsWith(TENANT_API_KEY_PREFIX)) {
    const apiKeyResult = await tenantApiKeyService.validateKey(bearerToken);
    if (!apiKeyResult) {
      res.status(401).json({ success: false, error: 'Invalid or revoked API key' });
      return;
    }
    if (clientTenantHeader && clientTenantHeader !== apiKeyResult.tenantId) {
      res.status(403).json({
        success: false,
        error: 'Tenant scope mismatch — x-tenant-id does not match the API key tenant',
      });
      return;
    }
    // Default-deny: an API key may only reach explicitly classified routes
    // with the scope that route requires (see security/api-key-scope-policy.ts).
    const decision = evaluateApiKeyPolicy(req.method, req.originalUrl || '', apiKeyResult.scopes);
    if (!decision.allowed) {
      res.status(403).json({
        success: false,
        error:
          decision.reason === 'missing_scope'
            ? `Missing required scope: ${decision.scope}`
            : 'API key is not permitted to access this route',
      });
      return;
    }
    attachTenantContext(req, {
      id: apiKeyResult.tenantId,
      source: 'tenant_api_key',
      scopes: apiKeyResult.scopes,
    });
    // Back-fill for legacy controllers that still read the header directly
    // instead of req.tenant — the header is never trusted as the source of
    // authorization here, only as a convenience echo of the verified tenant.
    if (!clientTenantHeader) {
      req.headers['x-tenant-id'] = apiKeyResult.tenantId;
    }
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
