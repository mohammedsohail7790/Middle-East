import type { Request } from 'express';

/**
 * Tenant id after requireVoiceApiAccess / voiceAuthUnlessPublic.
 * Only trusts the JWT-resolved tenant — never falls back to x-tenant-id header
 * to prevent cross-tenant impersonation.
 */
export function getRequestTenantId(req: Request): string {
  const resolved = (req as any).resolvedTenantId as string | undefined;
  if (resolved) return resolved;
  throw new Error('Tenant scope required — sign in again');
}
