export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type SafetyMode = 'strict' | 'standard' | 'off';
export type RiskTolerance = 'strict' | 'standard' | 'permissive';

export interface ExecutionLimits {
  maxExecutionsPerCall?: number;
  maxExecutionsPerMinute?: number;
  toolCooldownMs?: number;
  maxToolDepth?: number;
}

export interface TenantAiRuntimeConfig {
  tenantId: string;
  governanceEnabled: boolean;
  safetyMode: SafetyMode;
  riskTolerance: RiskTolerance;
  allowedTools: string[];
  disabledTools: string[];
  confirmationRequiredTools: string[];
  executionLimits: ExecutionLimits;
  autoCreateLead: boolean;
  autoScheduleAppointment: boolean;
  autoSendConfirmation: boolean;
  policyVersion: string;
}

export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
  maxExecutionsPerCall: 25,
  maxExecutionsPerMinute: 40,
  toolCooldownMs: 800,
  maxToolDepth: 12,
};

export const POLICY_VERSION = 'p3-v1';
