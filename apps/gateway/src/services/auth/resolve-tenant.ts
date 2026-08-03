import { timingSafeEqual } from 'crypto';
import { verifyUserBearerToken } from './jwt-tenant-verifier.js';
import { verifyInternalServiceRequest } from './internal-service-auth.js';
import { isV4ZeroTrustEnabled } from './tenant-context.js';
import { verifySseDashboardToken } from '../../security/sse-token.js';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Legacy resolver — delegates to V4 verifiers.
 * User auth: JWT tenant claim only (header tenant ignored when zero-trust on).
 */
export async function resolveTenantIdFromRequest(
  authHeader: string | undefined,
  headerTenantId: string | undefined,
  queryToken?: string,
  internalApiKey?: string
): Promise<{ tenantId: string } | { error: string; status: number }> {
  const configuredInternalKey = process.env.VOICE_INTERNAL_API_KEY;

  if (configuredInternalKey && internalApiKey && safeCompare(internalApiKey, configuredInternalKey)) {
    const internal = verifyInternalServiceRequest({
      apiKey: internalApiKey,
      tenantIdHeader: headerTenantId,
    });
    if ('error' in internal) {
      return internal;
    }
    return { tenantId: internal.tenantId };
  }

  if (authHeader?.startsWith('Bearer ')) {
    const verified = await verifyUserBearerToken(authHeader.slice(7));
    if ('error' in verified) {
      return verified;
    }
    if (isV4ZeroTrustEnabled()) {
      if (headerTenantId && headerTenantId !== verified.tenantId) {
        return {
          error: 'Tenant scope mismatch — use JWT tenant claim only',
          status: 403,
        };
      }
      return { tenantId: verified.tenantId };
    }
    if (headerTenantId && headerTenantId !== verified.tenantId) {
      return { error: 'Tenant scope mismatch', status: 403 };
    }
    return { tenantId: verified.tenantId };
  }

  if (queryToken) {
    const sse = verifySseDashboardToken(queryToken);
    if (sse) {
      if (headerTenantId && headerTenantId !== sse.tenantId) {
        return { error: 'Tenant scope mismatch', status: 403 };
      }
      return { tenantId: sse.tenantId };
    }
    return {
      error: 'Invalid or expired stream token — refresh and use Authorization header for API calls',
      status: 401,
    };
  }

  return { error: 'Unauthorized', status: 401 };
}
