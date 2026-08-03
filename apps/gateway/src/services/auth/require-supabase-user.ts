import type { Request, Response, NextFunction } from 'express';
import { verifySupabaseAuthOnly } from './jwt-tenant-verifier.js';

/** Authenticated Supabase user — tenant_id optional (onboarding). */
export async function requireSupabaseUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = String(req.header('authorization') || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!bearer) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const verified = await verifySupabaseAuthOnly(bearer);
  if ('error' in verified) {
    res.status(verified.status).json({ success: false, error: verified.error });
    return;
  }

  (req as { authUserId?: string }).authUserId = verified.userId;
  (req as { authEmail?: string }).authEmail = verified.email;
  (req as { resolvedTenantId?: string }).resolvedTenantId = verified.tenantId;
  next();
}
