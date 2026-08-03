import { voiceDb } from '../voice/tenant-scope.js';

const DEFAULT_TIMEZONE = 'America/New_York';
const TZ_CACHE_TTL_MS = Number(process.env.VOICE_TZ_CACHE_TTL_MS || 120_000);
const tzCache = new Map<string, { tz: string; expiresAt: number }>();

/**
 * Resolve IANA timezone for a tenant (voice_tenants.timezone or business_hours metadata).
 */
export async function getTenantTimezone(tenantId: string): Promise<string> {
  const cached = tzCache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.tz;
  }

  const result = await voiceDb.query(
    `SELECT timezone, metadata FROM public.voice_tenants WHERE id = $1 LIMIT 1`,
    [tenantId]
  );
  const row = result.rows[0] as
    | { timezone?: string; metadata?: { business_hours?: { timezone?: string } } }
    | undefined;

  const tz =
    row?.timezone?.trim() ||
    row?.metadata?.business_hours?.timezone?.trim() ||
    DEFAULT_TIMEZONE;

  tzCache.set(tenantId, { tz, expiresAt: Date.now() + TZ_CACHE_TTL_MS });
  return tz;
}

export function invalidateTenantTimezoneCache(tenantId: string): void {
  tzCache.delete(tenantId);
}
