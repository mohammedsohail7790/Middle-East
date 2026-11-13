/** What the automations API sends back (see apps/gateway/src/services/automation-engine/types.ts). Kept here so the dashboard does not import gateway code. */
export type FieldType = "text" | "number" | "boolean" | "select" | "email" | "url";

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  help?: string;
}

export type ApprovalMode = "auto" | "ask";

export interface TenantAutomation {
  id: string;
  templateKey: string;
  name: string;
  enabled: boolean;
  approvalMode: ApprovalMode;
  config: Record<string, unknown>;
}

export interface TemplateStep {
  key: string;
  title: string;
  external?: boolean;
}

export interface LibraryTemplate {
  key: string;
  name: string;
  description: string;
  trigger?: string;
  steps?: TemplateStep[];
  config?: ConfigField[];
  needs?: string[];
  minutesSavedPerRun?: number;
  automation: TenantAutomation | null;
}

export type RunStatus = "running" | "waiting_approval" | "succeeded" | "failed" | "skipped" | "rejected";
export type StepStatus = RunStatus | "pending";

export interface StepLogEntry {
  index: number;
  key: string;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  error?: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  triggerKind: string;
  status: RunStatus;
  steps: StepLogEntry[];
  error: string | null;
  minutesSaved: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface AutomationApproval {
  id: string;
  runId: string;
  stepIndex: number;
  stepKey: string;
  summary: string;
  proposal: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  expiresAt: string;
}

export interface AutomationStats {
  days: number;
  runs: number;
  succeeded: number;
  failed: number;
  waitingApproval: number;
  minutesSaved: number;
  byAutomation: Array<{ automationId: string; templateKey: string; name: string; runs: number; succeeded: number; minutesSaved: number }>;
}

export interface SavePayload {
  enabled: boolean;
  approvalMode: ApprovalMode;
  config: Record<string, unknown>;
}
