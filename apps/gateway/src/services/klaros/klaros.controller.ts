/**
 * Klaros Workforce API Contract
 *
 * Server-to-server surface Klaros uses to read/configure the Halla AI
 * workforce for a tenant, and to discover its agents. Authenticated via a
 * tenant-scoped API key (see middleware/require-tenant.ts) carrying the
 * `workforce.read` / `workforce.write` scopes — never a client-supplied
 * tenant header. Maps Klaros's business-context fields onto Halla's
 * existing ai_agent_configs model; does not introduce a second config
 * store.
 */
import express from 'express';
import { requireVoiceApiAccess } from '../voice/security.js';
import { requireScope } from '../../middleware/require-scope.js';
import { getTenantId } from '../auth/tenant-context.js';
import { aiConfigService } from '../ai-config/ai-config.service.js';
import { ivrService, type AIAgent } from '../ivr/ivr.service.js';
import { pool } from '../db/pool.js';
import { clientErrorMessage } from '../../security/safe-error.js';
import { lookupOrder, isValidOrderReference, ORDER_LOOKUP_BLOCKED } from '../order-lookup/order-lookup.service.js';
import { logger } from '../logger.js';

/** Klaros's business-context shape -> Halla's ai_agent_configs fields. Exported for unit testing. */
export function fromKlarosWorkforceInput(body: any): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (typeof body?.businessDescription === 'string') update.businessDescription = body.businessDescription;
  if (Array.isArray(body?.services)) update.servicesOffered = body.services;
  if (Array.isArray(body?.markets)) update.serviceAreas = body.markets;
  if (Array.isArray(body?.qualificationQuestions)) update.qualificationQuestions = body.qualificationQuestions;
  if (Array.isArray(body?.requiredCustomerInformation)) update.requiredFields = body.requiredCustomerInformation;
  if (body?.transferConditions && typeof body.transferConditions === 'object') {
    update.transferConditions = body.transferConditions;
  }
  if (typeof body?.operatingInstructions === 'string') update.systemInstructions = body.operatingInstructions;
  if (typeof body?.tone === 'string') update.tone = body.tone;
  if (typeof body?.personality === 'string') update.personality = body.personality;
  return update;
}

export function toKlarosWorkforceOutput(config: Awaited<ReturnType<typeof aiConfigService.getConfig>>) {
  return {
    businessDescription: config.businessDescription ?? null,
    services: config.servicesOffered,
    markets: config.serviceAreas,
    qualificationQuestions: config.qualificationQuestions,
    requiredCustomerInformation: config.requiredFields,
    transferConditions: config.transferConditions ?? {},
    operatingInstructions: config.systemInstructions ?? null,
    tone: config.tone,
    personality: config.personality,
    agentName: config.agentName,
    updatedAt: config.updatedAt,
  };
}

/**
 * Agent discovery projection for Klaros. Deliberately omits the agent's system
 * prompt (tenant IP), its transfer phone number and the tenant id — Klaros needs
 * to identify and describe agents, not read their prompts or escalation numbers.
 * The dashboard's own /ivr/agents endpoint is unchanged.
 */
export function toKlarosAgentOutput(agent: AIAgent) {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    tone: agent.tone,
    services: agent.services,
    voiceId: agent.voiceId,
    knowledgeCategory: agent.knowledgeCategory,
    maxDurationSeconds: agent.maxDurationSeconds,
    transferOnTimeout: agent.transferOnTimeout,
    hasTransferNumber: Boolean(agent.transferNumber),
    active: agent.active,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export function createKlarosRouter(): express.Router {
  const router = express.Router();
  router.use(requireVoiceApiAccess);

  // GET /api/v1/integrations/klaros/workforce — read current workforce configuration.
  router.get('/workforce', requireScope('workforce.read'), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const config = await aiConfigService.getConfig(tenantId);
      res.json({ success: true, data: toKlarosWorkforceOutput(config) });
    } catch (error) {
      res.status(400).json({ success: false, error: clientErrorMessage(error, 'Failed to read workforce configuration') });
    }
  });

  // PUT /api/v1/integrations/klaros/workforce — configure the workforce with business context.
  router.put('/workforce', requireScope('workforce.write'), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const update = fromKlarosWorkforceInput(req.body ?? {});
      const config = await aiConfigService.upsertConfig(tenantId, update);
      logger.info('KLAROS_WORKFORCE_CONFIGURED', { tenantId, fields: Object.keys(update) });
      res.json({ success: true, data: toKlarosWorkforceOutput(config) });
    } catch (error) {
      res.status(400).json({ success: false, error: clientErrorMessage(error, 'Failed to update workforce configuration') });
    }
  });

  // GET /api/v1/integrations/klaros/agents — discover the tenant's configured agents.
  router.get('/agents', requireScope('workforce.read'), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const agents = await ivrService.listAgents(tenantId);
      res.json({ success: true, data: agents.map(toKlarosAgentOutput) });
    } catch (error) {
      res.status(400).json({ success: false, error: clientErrorMessage(error, 'Failed to list agents') });
    }
  });

  // GET /api/v1/integrations/klaros/orders/:reference — READ-ONLY order status for the key's own tenant.
  // The tenant comes from the API key (never from the URL or body). Until Klaros publishes a read API there is no
  // provider, and this answers 501 ORDER_LOOKUP_BLOCKED_PENDING_KLAROS_READ_API rather than inventing data.
  router.get('/orders/:reference', requireScope('orders.read'), async (req, res) => {
    const tenantId = getTenantId(req);
    if (!isValidOrderReference(req.params.reference)) {
      res.status(400).json({ success: false, code: 'INVALID_REFERENCE', error: 'The order reference is not in a valid format.' });
      return;
    }
    const outcome = await lookupOrder(tenantId, req.params.reference);
    if (outcome.ok) {
      res.json({ success: true, data: outcome.order });
    } else if (outcome.code === ORDER_LOOKUP_BLOCKED) {
      res.status(501).json({ success: false, code: outcome.code, error: outcome.message });
    } else if (outcome.code === 'NOT_FOUND') {
      res.status(404).json({ success: false, code: outcome.code, error: outcome.message });
    } else {
      res.status(502).json({ success: false, code: outcome.code, error: outcome.message });
    }
  });

  // GET /api/v1/integrations/klaros/health — real health check: auth, tenant
  // resolution, and workforce-config accessibility — never "connected" from
  // a merely-configured URL.
  router.get('/health', async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const tenantRow = await pool.query(`SELECT id FROM public.voice_tenants WHERE id = $1 LIMIT 1`, [tenantId]);
      const tenantExists = tenantRow.rows.length > 0;

      let configAccessible = false;
      try {
        await aiConfigService.getConfig(tenantId);
        configAccessible = true;
      } catch {
        configAccessible = false;
      }

      res.json({
        success: true,
        data: {
          authenticated: true,
          tenantId,
          tenantExists,
          workforceConfigAccessible: configAccessible,
          status: tenantExists && configAccessible ? 'healthy' : 'degraded',
        },
      });
    } catch (error) {
      res.status(400).json({ success: false, error: clientErrorMessage(error, 'Health check failed') });
    }
  });

  return router;
}
