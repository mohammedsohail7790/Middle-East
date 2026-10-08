/**
 * Workforce templates for the Klaros pilot verticals.
 *
 * A template is TENANT-AGNOSTIC DATA: it carries instructions and structure only. It never carries a
 * medical provider, hospital, doctor, product, supplier, price, policy, tracking number, credential,
 * or any customer data — those are supplied per tenant by the business (through Klaros / the knowledge
 * base) and are listed under `requiredBusinessInputs`.
 *
 * It maps onto Halla's EXISTING model and invents no second config store:
 *   - one `ai_agents` row per agent        (name, role, system_prompt, tone, services, ...)
 *   - one `ai_agent_configs` row per tenant (shared by all of the tenant's agents)
 *   - the P3 governance columns on that same `ai_agent_configs` row (tool allow/deny, safety_mode, ...)
 */

export type WorkforceVertical = 'medical_tourism' | 'dropshipping';

/** Stable identifiers for the escalation triggers a vertical must cover. */
export type EscalationTriggerId =
  // medical tourism
  | 'emergency'
  | 'diagnosis_request'
  | 'prescription_request'
  | 'outcome_guarantee_request'
  | 'unknown_provider_information'
  | 'unknown_medical_or_business_information'
  | 'complaint'
  | 'sensitive_high_risk_case'
  | 'unclear_patient_requirements'
  | 'human_requested'
  // dropshipping
  | 'payment_dispute'
  | 'refund_dispute'
  | 'chargeback'
  | 'fraud_indicator'
  | 'legal_threat'
  | 'complaint_requiring_human'
  | 'delivery_guarantee_request'
  | 'unknown_supplier_information'
  | 'unknown_business_information'
  | 'missing_tracking'
  | 'failed_fulfillment';

export type EscalationAction = 'emergency_pathway' | 'transfer_to_human' | 'record_and_hand_off';

export interface EscalationTrigger {
  id: EscalationTriggerId;
  /** What the caller says or what the situation is — operator-readable. */
  description: string;
  action: EscalationAction;
  /** Agent keys whose prompt must instruct this escalation. */
  appliesTo: string[];
}

export interface WorkforceAgentTemplate {
  /** Stable key within the vertical (not persisted). */
  key: string;
  /** `ai_agents.name` — kept exactly as the Klaros pilot specification names it. */
  name: string;
  /** `ai_agents.role` — machine-readable role. */
  role: string;
  /** `ai_agents.system_prompt` — appended to the live realtime prompt for calls routed to this agent. */
  systemPrompt: string;
  tone: string;
  /** Always [] in a template: the services a tenant offers are tenant data, never a template default. */
  services: string[];
  knowledgeCategory: string | null;
  maxDurationSeconds: number;
  transferOnTimeout: boolean;
  responsibilities: string[];
  neverDo: string[];
  escalationTriggers: EscalationTriggerId[];
}

/** The P3 governance columns of `ai_agent_configs` (supabase/migrations/030_ai_governance_config.sql). */
export interface GovernanceProfile {
  governanceEnabled: boolean;
  safetyMode: 'strict' | 'standard' | 'off';
  riskTolerance: 'strict' | 'standard' | 'permissive';
  /** [] means "no allow-list restriction". */
  allowedTools: string[];
  disabledTools: string[];
  confirmationRequiredTools: string[];
  executionLimits: { maxExecutionsPerCall: number; maxExecutionsPerMinute: number; toolCooldownMs: number; maxToolDepth: number };
  autoCreateLead: boolean;
  autoScheduleAppointment: boolean;
  autoSendConfirmation: boolean;
}

export interface TenantConfigTemplate {
  /** LIVE-EFFECTIVE: appended (wrapped as untrusted tenant text) to every call's prompt. Shared by all agents. */
  systemInstructions: string;
  /** LIVE-EFFECTIVE (realtime-prompt-builder wraps these). Not settable through the Klaros PUT contract. */
  doInstructions: string[];
  dontInstructions: string[];
  tone: string;
  /** STORED ONLY today: not read by the live realtime prompt. Kept for the Klaros contract and the dashboard preview. */
  qualificationQuestions: string[];
  requiredFields: string[];
  optionalFields: string[];
  transferConditions: { enforcement: 'prompt_instruction'; triggers: EscalationTrigger[] };
  fallbackMessage: string;
  autoTransferEnabled: boolean;
}

export interface WorkforceTemplate {
  vertical: WorkforceVertical;
  /** Bump when prompts/triggers change so a deployed tenant can be compared with the spec. */
  version: string;
  displayName: string;
  agents: WorkforceAgentTemplate[];
  tenantConfig: TenantConfigTemplate;
  /** Tool-level governance (REAL enforcement in the live tool path) for a sandbox/staging tenant. */
  governanceSandbox: GovernanceProfile;
  /** Inputs the business must supply and that this template deliberately does NOT contain. */
  requiredBusinessInputs: string[];
  /** Capabilities the vertical assumes that Halla does not have today. */
  knownPlatformGaps: string[];
}
