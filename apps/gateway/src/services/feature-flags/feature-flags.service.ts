import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import { CacheManager } from '../cache.js';

const cache = new CacheManager();
const CACHE_TTL = 60; // 1 minute

export interface TenantFeatureFlags {
  [flagName: string]: boolean;
}

const PLAN_DEFAULT_FLAGS: Record<string, Record<string, boolean>> = {
  essential: {
    spam_protection: true,
    phone_porting: true,
    scheduled_reports: false,
    api_access: false,
    advanced_analytics: false,
    voice_cloning: false,
    multi_location: false,
    white_labeling: false,
    custom_ivr: false,
    scim_provisioning: false,
    hipaa_mode: false,
    sla_monitoring: false,
    msp_mode: false,
  },
  professional: {
    spam_protection: true,
    phone_porting: true,
    scheduled_reports: true,
    api_access: false,
    advanced_analytics: true,
    voice_cloning: true,
    multi_location: true,
    white_labeling: false,
    custom_ivr: true,
    scim_provisioning: false,
    hipaa_mode: false,
    sla_monitoring: false,
    msp_mode: false,
  },
  enterprise: {
    spam_protection: true,
    phone_porting: true,
    scheduled_reports: true,
    api_access: true,
    advanced_analytics: true,
    voice_cloning: true,
    multi_location: true,
    white_labeling: true,
    custom_ivr: true,
    scim_provisioning: true,
    hipaa_mode: true,
    sla_monitoring: true,
    msp_mode: false,
  },
};

export async function getTenantFlags(tenantId: string, plan?: string): Promise<TenantFeatureFlags> {
  const cacheKey = `feature_flags:${tenantId}`;
  const cached = await cache.get<TenantFeatureFlags>(cacheKey);
  if (cached) return cached;

  // Start with plan defaults
  const planKey = (plan || 'essential').toLowerCase();
  const defaults = PLAN_DEFAULT_FLAGS[planKey] || PLAN_DEFAULT_FLAGS.essential;
  const flags: TenantFeatureFlags = { ...defaults };

  // Override with explicit per-tenant flags
  try {
    const result = await pool.query(
      `SELECT flag_name, enabled FROM public.tenant_feature_flags WHERE tenant_id = $1`,
      [tenantId]
    );
    for (const row of result.rows) {
      flags[row.flag_name] = row.enabled;
    }
  } catch (error) {
    logger.warn('FEATURE_FLAGS_DB_ERROR', { tenantId, error: String(error) });
  }

  await cache.set(cacheKey, flags, { ttl: CACHE_TTL });
  return flags;
}

export async function isFlagEnabled(tenantId: string, flagName: string, plan?: string): Promise<boolean> {
  const flags = await getTenantFlags(tenantId, plan);
  return flags[flagName] ?? false;
}

export async function setFlag(
  tenantId: string,
  flagName: string,
  enabled: boolean,
  notes?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO public.tenant_feature_flags (tenant_id, flag_name, enabled, set_by_plan, notes)
     VALUES ($1, $2, $3, false, $4)
     ON CONFLICT (tenant_id, flag_name) DO UPDATE
     SET enabled = $3, set_by_plan = false, notes = $4, updated_at = NOW()`,
    [tenantId, flagName, enabled, notes || null]
  );
  // Invalidate cache
  await cache.del(`feature_flags:${tenantId}`).catch(() => undefined);
}
