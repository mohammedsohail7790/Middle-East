import type { Request } from 'express';

/** How the active tenant was established (audit / policy). */
export type TenantAuthSource = 'user_jwt' | 'internal_service' | 'legacy_jwt';

export interface TenantContext {
  id: string;
  userId?: string;
  source: TenantAuthSource;
  scopes?: string[];
}

export interface CallIqAuthenticatedRequest extends Request {
  tenant?: TenantContext;
  /** @deprecated Use req.tenant.id — kept for gradual controller migration */
  resolvedTenantId?: string;
  requestId?: string;
}

export function isV4ZeroTrustEnabled(): boolean {
  if (process.env.CALLIQ_V4_ZERO_TRUST === 'false') return false;
  if (process.env.CALLIQ_V4_ZERO_TRUST === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

export function attachTenantContext(
  req: Request,
  tenant: TenantContext
): CallIqAuthenticatedRequest {
  const r = req as CallIqAuthenticatedRequest;
  r.tenant = tenant;
  r.resolvedTenantId = tenant.id;
  return r;
}

/** Authoritative tenant id for services/controllers. */
export function getTenantId(req: Request): string {
  const r = req as CallIqAuthenticatedRequest;
  const id = r.tenant?.id ?? r.resolvedTenantId;
  if (!id) {
    throw new Error('Tenant context missing — route must use requireTenant middleware');
  }
  return id;
}

export function getTenantContext(req: Request): TenantContext | undefined {
  return (req as CallIqAuthenticatedRequest).tenant;
}
