/**
 * The contracts of the automation engine. A TEMPLATE is a ready-made automation the business can switch on (what starts it, what it does, in which steps).
 * A STEP is one action, carried out by an EXECUTOR registered under the step's `kind`. Templates are plain data, executors are code, and the engine in between
 * runs the steps in order, logs each one, and pauses for the owner's yes when the business is in "ask first" mode.
 */
export type TriggerKind = 'lead.created' | 'call.ended' | 'call.missed' | 'appointment.created' | 'document.received' | 'manual';

export const TRIGGER_KINDS: readonly TriggerKind[] = ['lead.created', 'call.ended', 'call.missed', 'appointment.created', 'document.received', 'manual'];

/** The kinds of action a step can be. Each is carried out by one executor (see executors/). */
export type StepKind =
  | 'crm.push_lead' //        create or update the lead in the business's connected CRM
  | 'email.send' //           send an email (to the owner/team or to the customer)
  | 'message.send' //         send an SMS or WhatsApp message to the customer
  | 'notify.team' //          alert the team (email, and Slack if connected)
  | 'webhook.post' //         send the data to a Zapier or custom webhook (how anything without a native connection is reached today)
  | 'document.extract' //     read a document with AI and pull out named fields
  | 'data.transform'; //      reshape or compute fields from earlier steps

export interface StepSpec {
  /** Unique within its template, e.g. "push-to-crm". */
  key: string;
  kind: StepKind;
  /** Words the owner sees: "Add the lead to your CRM". */
  title: string;
  /** Settings for the executor. A string "{{path.to.value}}" is replaced from the trigger payload, the owner's settings and earlier steps' outputs. */
  params?: Record<string, unknown>;
  /** True when this step changes something outside Halla AI (sends a message, writes to a CRM). In "ask first" mode, the run pauses before each such step. */
  external: boolean;
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'email' | 'url';
  required?: boolean;
  default?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  help?: string;
}

export interface AutomationTemplate {
  /** Stable id, saved on the business's automation: never rename one that has shipped. */
  key: string;
  name: string;
  /** One or two plain sentences for the library card. */
  description: string;
  trigger: TriggerKind;
  steps: StepSpec[];
  /** What the owner can set. */
  config: ConfigField[];
  /** A rough, honest estimate of the staff minutes one successful run saves. Shown in the time-saved report as an estimate. */
  minutesSavedPerRun: number;
  /** Words for the library card on what connection it needs, e.g. "A connected CRM". */
  needs?: string[];
}

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'waiting_approval' | 'rejected';

export interface StepLogEntry {
  index: number;
  key: string;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  /** One plain sentence on what happened, never raw errors or personal data beyond what the owner already holds. */
  summary?: string;
  error?: string;
}

export type RunStatus = 'running' | 'waiting_approval' | 'succeeded' | 'failed' | 'skipped' | 'rejected';
export type ApprovalMode = 'auto' | 'ask';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface TenantAutomation {
  id: string;
  tenantId: string;
  templateKey: string;
  name: string;
  enabled: boolean;
  approvalMode: ApprovalMode;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  tenantId: string;
  automationId: string;
  triggerKind: string;
  triggerRef: string;
  triggerPayload: Record<string, unknown>;
  status: RunStatus;
  steps: StepLogEntry[];
  error: string | null;
  minutesSaved: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface AutomationApproval {
  id: string;
  tenantId: string;
  runId: string;
  stepIndex: number;
  stepKey: string;
  summary: string;
  proposal: Record<string, unknown>;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  expiresAt: string;
}

/** What an executor receives. It must use only these inputs: the step's resolved params, the tenant, and a way to read earlier outputs. */
export interface ExecutorContext {
  tenantId: string;
  automation: TenantAutomation;
  runId: string;
  step: StepSpec;
  /** `step.params` with every "{{...}}" already replaced. */
  params: Record<string, unknown>;
  /** Everything the run knows: { trigger, config, steps: { [stepKey]: output } }. */
  data: Record<string, unknown>;
  /** True when the owner approved this exact step (or the business runs in auto mode). Executors for external steps must refuse to act when this is false. */
  approved: boolean;
}

export interface ExecutorResult {
  /** One plain sentence for the run log. */
  summary: string;
  /** Saved under `data.steps[step.key]` for later steps. */
  output?: Record<string, unknown>;
  /** When set, the step did nothing on purpose (for example no CRM is connected) and the run carries on; the log shows this as skipped with the reason. */
  skipped?: boolean;
}

export type StepExecutor = (ctx: ExecutorContext) => Promise<ExecutorResult>;
