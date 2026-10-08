import { scanPromptInjection } from '../../security/prompt-safety.js';
import type { EscalationTriggerId, WorkforceTemplate, WorkforceVertical } from './types.js';
import { medicalTourismTemplate } from './medical-tourism.js';
import { dropshippingTemplate } from './dropshipping.js';

export * from './types.js';
export { medicalTourismTemplate, dropshippingTemplate };

export const WORKFORCE_TEMPLATES: Record<WorkforceVertical, WorkforceTemplate> = {
  medical_tourism: medicalTourismTemplate,
  dropshipping: dropshippingTemplate,
};

/** Triggers each vertical must be able to escalate on (the pilot specification). */
export const REQUIRED_TRIGGERS: Record<WorkforceVertical, EscalationTriggerId[]> = {
  medical_tourism: [
    'emergency', 'diagnosis_request', 'prescription_request', 'outcome_guarantee_request',
    'unknown_provider_information', 'unknown_medical_or_business_information', 'complaint',
    'sensitive_high_risk_case', 'unclear_patient_requirements', 'human_requested',
  ],
  dropshipping: [
    'payment_dispute', 'refund_dispute', 'chargeback', 'fraud_indicator', 'legal_threat',
    'complaint_requiring_human', 'delivery_guarantee_request', 'missing_tracking', 'failed_fulfillment',
    'human_requested',
  ],
};

/** The tenant-wide wrapUntrustedBlock() cap: text beyond it is truncated, which would drop the closing delimiter. */
const MAX_BLOCK_CHARS = 8_000;

/**
 * Patterns that mean a template has stopped being tenant-agnostic data: contact details, secrets, money amounts,
 * long digit runs (phone / card / id numbers) and URLs. A template must carry none of these.
 */
const FORBIDDEN_CONTENT: Array<[string, RegExp]> = [
  ['url', /https?:\/\/|www\./i],
  ['email address', /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ['digit run (phone/card/id)', /\d{3,}/],
  ['money amount', /[$€£]\s?\d|\d\s?(usd|eur|gbp|aed|sar|dollars|euros)\b/i],
  ['secret-like token', /\b(sk|pk|rk)_[a-z0-9_]{6,}|-----BEGIN|bearer\s+[a-z0-9._-]{12,}/i],
];

function allText(template: WorkforceTemplate): Array<{ where: string; text: string }> {
  const parts: Array<{ where: string; text: string }> = [];
  for (const a of template.agents) {
    parts.push({ where: `agent:${a.key}:systemPrompt`, text: a.systemPrompt });
    parts.push({ where: `agent:${a.key}:name`, text: a.name });
  }
  const c = template.tenantConfig;
  parts.push({ where: 'tenantConfig:systemInstructions', text: c.systemInstructions });
  c.doInstructions.forEach((t, i) => parts.push({ where: `tenantConfig:do[${i}]`, text: t }));
  c.dontInstructions.forEach((t, i) => parts.push({ where: `tenantConfig:dont[${i}]`, text: t }));
  c.qualificationQuestions.forEach((t, i) => parts.push({ where: `tenantConfig:question[${i}]`, text: t }));
  parts.push({ where: 'tenantConfig:fallbackMessage', text: c.fallbackMessage });
  c.transferConditions.triggers.forEach((t) => parts.push({ where: `trigger:${t.id}`, text: t.description }));
  return parts;
}

/**
 * Static checks a template must pass before it is ever applied to a tenant. Returns the list of problems
 * (empty = valid). Pure: no I/O.
 */
export function validateWorkforceTemplate(template: WorkforceTemplate): string[] {
  const problems: string[] = [];

  if (template.agents.length !== 3) problems.push(`expected 3 agents, found ${template.agents.length}`);
  const keys = new Set(template.agents.map((a) => a.key));
  if (keys.size !== template.agents.length) problems.push('agent keys are not unique');
  if (new Set(template.agents.map((a) => a.name)).size !== template.agents.length) problems.push('agent names are not unique');

  const triggerIds = new Set(template.tenantConfig.transferConditions.triggers.map((t) => t.id));
  for (const required of REQUIRED_TRIGGERS[template.vertical]) {
    if (!triggerIds.has(required)) problems.push(`missing required escalation trigger: ${required}`);
  }
  for (const trig of template.tenantConfig.transferConditions.triggers) {
    for (const key of trig.appliesTo) if (!keys.has(key)) problems.push(`trigger ${trig.id} applies to unknown agent ${key}`);
  }
  for (const agent of template.agents) {
    for (const id of agent.escalationTriggers) {
      if (!triggerIds.has(id)) problems.push(`agent ${agent.key} lists unknown trigger ${id}`);
    }
    for (const trig of template.tenantConfig.transferConditions.triggers) {
      if (trig.appliesTo.includes(agent.key) && !agent.escalationTriggers.includes(trig.id)) {
        problems.push(`trigger ${trig.id} applies to ${agent.key} but the agent does not list it`);
      }
    }
    if (agent.services.length !== 0) problems.push(`agent ${agent.key} carries services; services are tenant data`);
    if (agent.systemPrompt.length > MAX_BLOCK_CHARS) problems.push(`agent ${agent.key} prompt exceeds ${MAX_BLOCK_CHARS} chars`);
  }
  if (template.tenantConfig.systemInstructions.length > MAX_BLOCK_CHARS) {
    problems.push(`systemInstructions exceeds ${MAX_BLOCK_CHARS} chars (wrapUntrustedBlock would truncate it)`);
  }

  for (const { where, text } of allText(template)) {
    const injection = scanPromptInjection(text);
    if (injection) problems.push(`${where}: matches the prompt-injection scanner (${injection})`);
    for (const [label, re] of FORBIDDEN_CONTENT) {
      if (re.test(text)) problems.push(`${where}: contains a ${label}`);
    }
  }

  const g = template.governanceSandbox;
  if (g.disabledTools.includes('transfer_call')) problems.push('governance disables transfer_call, which every escalation depends on');
  if (g.safetyMode === 'strict') problems.push("governance safetyMode 'strict' makes the live governance layer deny transfer_call");
  if (template.vertical === 'medical_tourism' && !g.disabledTools.includes('lookup_order')) problems.push('medical tourism must disable lookup_order');
  if (!g.disabledTools.includes('send_sms')) problems.push('sandbox governance must disable send_sms');
  if (g.autoScheduleAppointment || g.autoSendConfirmation) problems.push('sandbox governance must not auto-book or auto-send');

  return problems;
}

/**
 * The body of Klaros's `PUT /api/v1/integrations/klaros/workforce` for this template.
 *
 * Restricted to what fromKlarosWorkforceInput() accepts AND to what is not tenant data: it deliberately omits
 * businessDescription, services and markets (the business supplies those), and carries no customer, medical,
 * payment or supplier data of any kind. Everything in it is instruction text.
 */
export function toKlarosWorkforcePayload(template: WorkforceTemplate): Record<string, unknown> {
  const c = template.tenantConfig;
  return {
    qualificationQuestions: c.qualificationQuestions,
    requiredCustomerInformation: c.requiredFields,
    transferConditions: c.transferConditions,
    operatingInstructions: c.systemInstructions,
    tone: c.tone,
  };
}
