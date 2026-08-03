import type { Response, NextFunction } from 'express';
import type { CallIqAuthenticatedRequest } from '../services/auth/tenant-context.js';

/** Dashboard user roles (P5 RBAC foundation). */
export type DashboardRole = 'owner' | 'admin' | 'operator' | 'manager' | 'readonly';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Lightweight scope guard until full RBAC tables are enforced.
 * Internal service calls bypass; user JWT defaults to operator-level write.
 */
export function apiScopeMiddleware(
  req: CallIqAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const r = req;
  if (r.tenant?.source === 'internal_service') {
    next();
    return;
  }

  const roleHeader = (req.header('x-dashboard-role') || 'operator').toLowerCase() as DashboardRole;
  const readonly = roleHeader === 'readonly';

  if (readonly && WRITE_METHODS.has(req.method.toUpperCase())) {
    res.status(403).json({
      success: false,
      error: 'Read-only role cannot modify resources',
    });
    return;
  }

  next();
}
