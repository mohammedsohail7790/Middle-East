import type { TenantAiRuntimeConfig } from './ai-runtime-config.js';
import type { ToolExecutionPolicy } from './tool-policy-engine.js';
import { resolveToolPolicy } from './tool-policy-engine.js';

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
  policy: ToolExecutionPolicy;
}

export function evaluateRuntimePermissions(
  config: TenantAiRuntimeConfig,
  toolName: string
): PermissionDecision {
  if (!config.governanceEnabled) {
    return {
      allowed: true,
      policy: resolveToolPolicy(config.tenantId, toolName),
    };
  }

  if (process.env.CALLIQ_AI_EMERGENCY_DISABLE === 'true') {
    return {
      allowed: false,
      reason: 'AI tools emergency-disabled platform-wide',
      policy: resolveToolPolicy(config.tenantId, toolName, { emergencyDisable: true }),
    };
  }

  const policy = resolveToolPolicy(config.tenantId, toolName, {
    disabledTools: config.disabledTools,
    allowedTools: config.allowedTools,
    confirmationRequired: config.confirmationRequiredTools,
  });

  if (!policy.enabled) {
    return { allowed: false, reason: `Tool ${toolName} disabled by policy`, policy };
  }

  if (toolName === 'create_lead' && !config.autoCreateLead) {
    return { allowed: false, reason: 'Lead creation disabled for tenant', policy };
  }
  if (
    (toolName === 'create_appointment' || toolName === 'schedule_appointment') &&
    !config.autoScheduleAppointment
  ) {
    // Still allow explicit booking tools when agent invokes — only block if strict safety
    if (config.safetyMode === 'strict') {
      return {
        allowed: false,
        reason: 'Appointment booking disabled for tenant',
        policy,
      };
    }
  }
  if (toolName === 'send_sms' && !config.autoSendConfirmation && config.safetyMode === 'strict') {
    return { allowed: false, reason: 'SMS disabled for tenant', policy };
  }

  return { allowed: true, policy };
}
