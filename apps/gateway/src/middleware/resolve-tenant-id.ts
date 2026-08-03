import type { Request } from 'express';
import { getTenantId } from '../services/auth/tenant-context.js';

/** JWT tenant from requireTenant; legacy x-tenant-id for internal callers. */
export function resolveTenantId(req: Request): string {
  try {
    return getTenantId(req);
  } catch {
    const legacy = req.header('x-tenant-id');
    if (legacy) return legacy;
    throw new Error('Tenant context missing — route must use requireTenant middleware');
  }
}
