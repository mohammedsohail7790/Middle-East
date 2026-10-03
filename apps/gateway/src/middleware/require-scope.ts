import type { Request, Response, NextFunction } from 'express';
import { getTenantContext } from '../services/auth/tenant-context.js';

/**
 * Enforces a scope on the authenticated tenant context. Only meaningful for
 * credentials that carry explicit scopes (tenant API keys, internal service
 * keys) — a dashboard user JWT has no `scopes` array and is treated as
 * carrying full access, matching existing dashboard behavior unchanged.
 */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tenant = getTenantContext(req);
    if (!tenant) {
      res.status(401).json({ success: false, error: 'Tenant context missing' });
      return;
    }
    if (tenant.source !== 'tenant_api_key' && tenant.source !== 'internal_service') {
      next();
      return;
    }
    if (!tenant.scopes || !tenant.scopes.includes(scope)) {
      res.status(403).json({
        success: false,
        error: `Missing required scope: ${scope}`,
      });
      return;
    }
    next();
  };
}
