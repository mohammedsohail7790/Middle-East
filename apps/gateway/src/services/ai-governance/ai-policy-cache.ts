import {
  DEFAULT_EXECUTION_LIMITS,
  POLICY_VERSION,
  type TenantAiRuntimeConfig,
} from './ai-runtime-config.js';

export type { TenantAiRuntimeConfig };

const cache = new Map<string, { config: TenantAiRuntimeConfig; expiresAt: number }>();
const TTL_MS = Number(process.env.AI_POLICY_CACHE_TTL_MS || 60_000);

export function getCachedTenantConfig(tenantId: string): TenantAiRuntimeConfig | null {
  const row = cache.get(tenantId);
  if (!row || Date.now() > row.expiresAt) {
    if (row) cache.delete(tenantId);
    return null;
  }
  return row.config;
}

export function setCachedTenantConfig(config: TenantAiRuntimeConfig): void {
  cache.set(config.tenantId, { config, expiresAt: Date.now() + TTL_MS });
}

export function invalidateTenantPolicy(tenantId: string): void {
  cache.delete(tenantId);
}

export function defaultTenantConfig(tenantId: string): TenantAiRuntimeConfig {
  return {
    tenantId,
    governanceEnabled: process.env.CALLIQ_P3_GOVERNANCE !== 'false',
    safetyMode: 'standard',
    riskTolerance: 'standard',
    allowedTools: [],
    disabledTools: [],
    confirmationRequiredTools: [],
    executionLimits: { ...DEFAULT_EXECUTION_LIMITS },
    autoCreateLead: true,
    autoScheduleAppointment: false,
    autoSendConfirmation: true,
    policyVersion: POLICY_VERSION,
  };
}
