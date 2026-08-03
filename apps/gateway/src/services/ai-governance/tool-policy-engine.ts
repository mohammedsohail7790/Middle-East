import type { RiskLevel } from './ai-runtime-config.js';

export interface ToolExecutionPolicy {
  tenantId: string;
  toolName: string;
  enabled: boolean;
  requiresConfirmation?: boolean;
  maxExecutionsPerCall?: number;
  maxExecutionsPerMinute?: number;
  allowedRoles?: string[];
  riskLevel: RiskLevel;
  constraints?: {
    businessHoursOnly?: boolean;
    requireKnownCustomer?: boolean;
    preventDuplicateExecution?: boolean;
  };
}

const DEFAULT_TOOL_POLICIES: Record<
  string,
  Omit<ToolExecutionPolicy, 'tenantId' | 'toolName'>
> = {
  search_knowledge_base: {
    enabled: true,
    riskLevel: 'low',
    constraints: { preventDuplicateExecution: false },
  },
  lookup_customer: { enabled: true, riskLevel: 'low' },
  update_customer: { enabled: true, riskLevel: 'low' },
  check_availability: { enabled: true, riskLevel: 'low' },
  create_lead: {
    enabled: true,
    riskLevel: 'low',
    maxExecutionsPerCall: 3,
    constraints: { preventDuplicateExecution: true },
  },
  create_appointment: {
    enabled: true,
    riskLevel: 'medium',
    maxExecutionsPerCall: 2,
    constraints: { preventDuplicateExecution: true },
  },
  schedule_appointment: {
    enabled: true,
    riskLevel: 'medium',
    maxExecutionsPerCall: 2,
    constraints: { preventDuplicateExecution: true },
  },
  reschedule_appointment: {
    enabled: true,
    riskLevel: 'medium',
    maxExecutionsPerCall: 2,
    constraints: { preventDuplicateExecution: true },
  },
  cancel_appointment: {
    enabled: true,
    riskLevel: 'medium',
    maxExecutionsPerCall: 2,
  },
  send_sms: {
    enabled: true,
    riskLevel: 'high',
    maxExecutionsPerCall: 2,
    maxExecutionsPerMinute: 5,
    constraints: { preventDuplicateExecution: true },
  },
  transfer_call: {
    enabled: true,
    riskLevel: 'critical',
    maxExecutionsPerCall: 1,
    requiresConfirmation: true,
  },
};

export function resolveToolPolicy(
  tenantId: string,
  toolName: string,
  overrides?: {
    disabledTools?: string[];
    allowedTools?: string[];
    confirmationRequired?: string[];
    emergencyDisable?: boolean;
  }
): ToolExecutionPolicy {
  const base = DEFAULT_TOOL_POLICIES[toolName] || {
    enabled: false,
    riskLevel: 'high' as RiskLevel,
  };

  let enabled = base.enabled;
  if (overrides?.emergencyDisable) enabled = false;
  if (overrides?.disabledTools?.includes(toolName)) enabled = false;
  if (
    overrides?.allowedTools?.length &&
    !overrides.allowedTools.includes(toolName)
  ) {
    enabled = false;
  }

  return {
    tenantId,
    toolName,
    enabled,
    requiresConfirmation:
      base.requiresConfirmation ||
      overrides?.confirmationRequired?.includes(toolName),
    maxExecutionsPerCall: base.maxExecutionsPerCall,
    maxExecutionsPerMinute: base.maxExecutionsPerMinute,
    riskLevel: base.riskLevel,
    constraints: base.constraints,
  };
}
