import { pool } from '../db/pool.js';
import { aiConfigService } from '../ai-config/ai-config.service.js';
import { ivrService } from '../ivr/ivr.service.js';
import { logger } from '../logger.js';
import { validateWorkforceTemplate } from './index.js';
import { getMaxAiAgents } from '../../config/plan-limits.js';
import type { WorkforceTemplate } from './types.js';

/**
 * SANDBOX-ONLY provisioning of a workforce template onto an existing tenant, through the existing services
 * (aiConfigService, ivrService) and the P3 governance columns. Nothing here touches a phone number, places a call,
 * contacts a customer or creates a lead.
 *
 * It is deliberately hard to point at a real tenant or a production deployment. ALL of these must hold:
 *   1. HALLA_ENVIRONMENT is explicitly "staging", "development" or "test". It is unset in production, and NODE_ENV
 *      cannot be used instead because the staging and production blueprints both set NODE_ENV=production.
 *   2. The tenant id appears in HALLA_WORKFORCE_SANDBOX_TENANT_IDS (a comma-separated allow-list that is empty by
 *      default, so by default this refuses everything).
 *   3. The template passes its static validation (no tenant facts, no secrets, safe governance).
 *   4. Pre-flight passes: the tenant has an E.164 transfer number (every escalation relies on transfer_call), and its
 *      plan allows as many agents as the template defines (so a refusal happens BEFORE anything is written, never half-way).
 * Business knowledge (providers, catalogue, prices, policies) is never part of a template; a tenant with an empty
 * knowledge base gets a warning, because the agents will correctly answer "I don't have that information" to everything.
 */
export class WorkforceProvisioningError extends Error {}

export interface ProvisionResult {
  tenantId: string;
  vertical: string;
  templateVersion: string;
  dryRun: boolean;
  config: 'upserted' | 'skipped';
  governance: 'applied' | 'skipped';
  agents: Array<{ key: string; name: string; id: string | null; action: 'created' | 'updated' | 'would_create' | 'would_update' }>;
  /** Non-blocking observations (for example an empty knowledge base). */
  warnings: string[];
}

const SANDBOX_ENVIRONMENTS = new Set(['staging', 'development', 'test']);
const E164 = /^\+[1-9]\d{6,14}$/;

/** Refuses unless the process was explicitly started as a non-production environment. Fail-safe: unset means refuse. */
export function assertSandboxEnvironment(): void {
  const env = (process.env.HALLA_ENVIRONMENT || '').trim().toLowerCase();
  if (!SANDBOX_ENVIRONMENTS.has(env)) {
    throw new WorkforceProvisioningError(
      'Refusing to provision: HALLA_ENVIRONMENT must be explicitly "staging", "development" or "test". Production never provisions demo workforces.'
    );
  }
}

function sandboxAllowList(): Set<string> {
  return new Set(
    (process.env.HALLA_WORKFORCE_SANDBOX_TENANT_IDS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** SANDBOX entry point: unchanged guards (explicit non-production HALLA_ENVIRONMENT + tenant allow-list). */
export async function applyWorkforceTemplate(
  tenantId: string,
  template: WorkforceTemplate,
  opts: { dryRun?: boolean } = {}
): Promise<ProvisionResult> {
  assertSandboxEnvironment();
  if (!sandboxAllowList().has(tenantId.toLowerCase())) {
    throw new WorkforceProvisioningError(
      'Refusing to provision: the tenant is not in HALLA_WORKFORCE_SANDBOX_TENANT_IDS (sandbox tenants only).'
    );
  }
  return applyValidatedTemplate(tenantId, template, opts);
}

/**
 * OWNER entry point for a REAL tenant. It performs NO sandbox/allow-list check, so it must only ever be called by code that
 * has already (1) authenticated the caller, (2) verified that the caller is an `owner` of exactly this organization, and
 * (3) confirmed the operator meant this organization. The only caller is the owner-only route in
 * services/workforce-templates/workforce-owner.controller.ts, which is itself disabled unless
 * HALLA_OWNER_WORKFORCE_APPLY=true. It shares every other safeguard with the sandbox path (template validation, a valid
 * E.164 transfer number for escalation, the plan's agent limit, pre-flight before any write).
 */
export async function applyWorkforceTemplateForOwner(
  organizationId: string,
  template: WorkforceTemplate,
  opts: { dryRun?: boolean } = {}
): Promise<ProvisionResult> {
  return applyValidatedTemplate(organizationId, template, opts);
}

async function applyValidatedTemplate(
  tenantId: string,
  template: WorkforceTemplate,
  opts: { dryRun?: boolean }
): Promise<ProvisionResult> {
  const dryRun = Boolean(opts.dryRun);

  const problems = validateWorkforceTemplate(template);
  if (problems.length > 0) {
    throw new WorkforceProvisioningError(`Refusing to provision an invalid template: ${problems.slice(0, 5).join('; ')}`);
  }
  const tenant = await pool.query('SELECT id, transfer_phone_number FROM public.voice_tenants WHERE id = $1', [tenantId]);
  if (tenant.rows.length === 0) throw new WorkforceProvisioningError('Tenant not found.');

  const existingAgents = await ivrService.listAgents(tenantId);
  const byName = new Map(existingAgents.map((a) => [a.name, a]));

  // Pre-flight: everything that would make the apply fail or leave it half-done is checked before the first write.
  const transfer = String(tenant.rows[0].transfer_phone_number ?? '').replace(/[\s()-]/g, '');
  if (!E164.test(transfer)) {
    throw new WorkforceProvisioningError(
      'Refusing to provision: the tenant has no valid E.164 transfer number. Every escalation relies on transfer_call, so a workforce without one cannot escalate.'
    );
  }
  const sub = await pool.query('SELECT plan, status FROM public.subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1', [tenantId]);
  const maxAgents = getMaxAiAgents(sub.rows[0]?.plan || 'essential', sub.rows[0]?.status);
  const activeOther = existingAgents.filter((a) => a.active && !template.agents.some((t) => t.name === a.name)).length;
  const needed = activeOther + template.agents.length;
  if (needed > maxAgents) {
    throw new WorkforceProvisioningError(
      `Refusing to provision: the tenant's plan allows ${maxAgents} active agent(s) but this workforce needs ${needed}. A professional (or trialing) plan allows 3.`
    );
  }
  const warnings: string[] = [];
  try {
    const kb = await pool.query('SELECT 1 FROM public.knowledge_base WHERE tenant_id = $1 LIMIT 1', [tenantId]);
    if (kb.rows.length === 0) {
      warnings.push('The tenant knowledge base is empty. Business knowledge is external to the template; until it is loaded the agents can only answer that they do not have the information.');
    }
  } catch {
    warnings.push('The knowledge base could not be checked.');
  }

  const result: ProvisionResult = {
    tenantId,
    vertical: template.vertical,
    templateVersion: template.version,
    dryRun,
    config: dryRun ? 'skipped' : 'upserted',
    governance: dryRun ? 'skipped' : 'applied',
    agents: [],
    warnings,
  };

  if (!dryRun) {
    const c = template.tenantConfig;
    // Tenant business data (businessDescription, servicesOffered, serviceAreas) is intentionally NOT written:
    // upsertConfig merges over the existing row, so whatever the business has already configured is kept.
    await aiConfigService.upsertConfig(tenantId, {
      systemInstructions: c.systemInstructions,
      doInstructions: c.doInstructions,
      dontInstructions: c.dontInstructions,
      tone: c.tone,
      qualificationQuestions: c.qualificationQuestions,
      requiredFields: c.requiredFields,
      optionalFields: c.optionalFields,
      transferConditions: c.transferConditions,
      fallbackMessage: c.fallbackMessage,
      autoTransferEnabled: c.autoTransferEnabled,
      autoCreateLead: template.governanceSandbox.autoCreateLead,
      autoScheduleAppointment: template.governanceSandbox.autoScheduleAppointment,
      autoSendConfirmation: template.governanceSandbox.autoSendConfirmation,
    });

    const g = template.governanceSandbox;
    await pool.query(
      `UPDATE public.ai_agent_configs
          SET allowed_tools = $2::jsonb, disabled_tools = $3::jsonb, confirmation_required_tools = $4::jsonb,
              execution_limits = $5::jsonb, safety_mode = $6, risk_tolerance = $7, ai_governance_enabled = $8,
              updated_at = NOW()
        WHERE tenant_id = $1`,
      [
        tenantId,
        JSON.stringify(g.allowedTools),
        JSON.stringify(g.disabledTools),
        JSON.stringify(g.confirmationRequiredTools),
        JSON.stringify(g.executionLimits),
        g.safetyMode,
        g.riskTolerance,
        g.governanceEnabled,
      ]
    );
  }

  for (const agent of template.agents) {
    const fields = {
      name: agent.name,
      role: agent.role,
      systemPrompt: agent.systemPrompt,
      tone: agent.tone,
      services: agent.services,
      maxDurationSeconds: agent.maxDurationSeconds,
      transferOnTimeout: agent.transferOnTimeout,
    };
    const existing = byName.get(agent.name);
    if (existing) {
      if (dryRun) {
        result.agents.push({ key: agent.key, name: agent.name, id: existing.id, action: 'would_update' });
      } else {
        const updated = await ivrService.updateAgent(tenantId, existing.id, { ...fields, active: true });
        result.agents.push({ key: agent.key, name: agent.name, id: updated.id, action: 'updated' });
      }
    } else if (dryRun) {
      result.agents.push({ key: agent.key, name: agent.name, id: null, action: 'would_create' });
    } else {
      const created = await ivrService.createAgent(tenantId, fields); // enforces the plan's agent limit
      result.agents.push({ key: agent.key, name: agent.name, id: created.id, action: 'created' });
    }
  }

  logger.info('WORKFORCE_TEMPLATE_APPLIED', {
    tenantId,
    vertical: template.vertical,
    templateVersion: template.version,
    dryRun,
    agents: result.agents.map((a) => `${a.key}:${a.action}`),
  });
  return result;
}
