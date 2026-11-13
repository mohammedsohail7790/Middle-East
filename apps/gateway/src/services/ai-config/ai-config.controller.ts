/**
 * AI Configuration Controller
 * API endpoints for AI agent customization
 */

import { aiConfigService } from './ai-config.service.js';
import { logger } from '../logger.js';
import { asyncHandler } from '../../middleware/index.js';
import { Router } from 'express';
import { billingService } from '../billing/billing.service.js';
import {
  validateVoiceConfig,
  getAllowedLanguages,
  type LanguageCode,
  type VoiceProvider,
} from '../../config/plan-config.js';
import { aiConfigWebSocketManager } from './ai-config.websocket.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { getTenantId } from '../auth/tenant-context.js';
import { voiceRedis } from '../voice/redis.client.js';
import { toDashboardConfig, fromDashboardBody, normalizeDashboardConfig } from './ai-config.dto.js';
import {
  buildPreviewSampleText,
  resolveLanguageCode,
  synthesizeOpenAiTtsMp3,
  ttsInstructionsFor,
} from '../realtime/receptionist-voice.js';

export function createAIConfigRouter(): Router {
  const router = Router();
  router.use(requireVoiceApiAccess);

  /**
   * POST /api/v1/ai-config/test-voice
   * Generate a voice sample using OpenAI TTS
   */
  router.post('/test-voice', async (req: any, res: any) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        return res.status(503).json({
          success: false,
          error: 'Voice preview unavailable — OPENAI_API_KEY is not set on the gateway.',
        });
      }

      const { voice, text, language, agentName } = req.body;
      const langCode = resolveLanguageCode(language);
      const customText = typeof text === 'string' ? text.trim() : '';

      const sampleText = buildPreviewSampleText({
        language: typeof language === 'string' && language ? language : langCode,
        agentName: agentName || 'Sarah',
        greetingMessage: langCode === 'en' ? customText : customText || undefined,
      });

      let buffer: Buffer;
      try {
        buffer = await synthesizeOpenAiTtsMp3(sampleText, voice || 'marin', { instructions: ttsInstructionsFor(typeof language === 'string' ? language : undefined) });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Voice preview failed',
        });
      }
      res.set('Content-Type', 'audio/mpeg');
      res.set('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Voice preview failed',
      });
    }
  });

  /**
   * GET /api/v1/ai-config/ws-token
   * Short-lived token for authenticated dashboard WebSocket subscriptions
   */
  router.get(
    '/ws-token',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = (req as any).resolvedTenantId as string;
      const { issueWsSessionToken } = await import('../auth/ws-session-tokens.js');
      const token = await issueWsSessionToken({ tenantId });
      res.json({ success: true, data: { token } });
    })
  );

  /**
   * GET /api/v1/ai-config
   * Get AI configuration for tenant
   */
  router.get(
    '/',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);

      const config = await aiConfigService.getConfig(tenantId);
      let plan = 'essential';
      try {
        const sub = await billingService.getActiveSubscription(tenantId);
        plan = sub?.status === 'trialing' ? 'trial' : (sub?.plan || 'essential');
      } catch (billingErr) {
        logger.warn('[AI Config] Billing lookup failed; using essential plan defaults', {
          tenantId,
          error: String(billingErr),
        });
      }

      res.json({
        success: true,
        data: {
          ...normalizeDashboardConfig(toDashboardConfig(config)),
          allowedLanguages: getAllowedLanguages(plan),
        },
      });
    })
  );

  /**
   * PUT /api/v1/ai-config
   * Update AI configuration
   */
  router.put(
    '/',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);

      // Changing how the receptionist talks to customers needs write access; a viewer cannot.
      {
        const { resolveUserRole, requirePermission } = await import('../enterprise/rbac.service.js');
        const role = await resolveUserRole(tenantId, req.tenant?.userId);
        if (!requirePermission(role, 'ops:write').ok) {
          return res.status(403).json({ success: false, error: 'You do not have permission to change the AI settings' });
        }
      }

      // Validate voice/language settings against plan
      const existing = await aiConfigService.getConfig(tenantId);
      const parsed = fromDashboardBody(req.body);
      const { scanPromptInjection, sanitizeUntrustedText } = await import('../../security/prompt-safety.js');
      const injectionFields = [
        parsed.systemInstructions,
        ...(parsed.doInstructions || []),
        ...(parsed.dontInstructions || []),
        ...((parsed.qualificationQuestions as string[] | undefined) || []),
        parsed.greetingMessage,
      ].filter(Boolean) as string[];
      for (const field of injectionFields) {
        const hit = scanPromptInjection(String(field));
        if (hit) {
          return res.status(400).json({ success: false, error: 'Invalid instructions in configuration' });
        }
      }
      if (parsed.systemInstructions) {
        parsed.systemInstructions = sanitizeUntrustedText(parsed.systemInstructions, 4000);
      }
      const { capabilities, ...configFields } = parsed;
      let plan = 'essential';
      try {
        const sub = await billingService.getActiveSubscription(tenantId);
        plan = sub?.status === 'trialing' ? 'trial' : (sub?.plan || 'essential');
      } catch (billingErr) {
        logger.warn('[AI Config] Billing lookup failed on save; using essential plan defaults', {
          tenantId,
          error: String(billingErr),
        });
      }
      const allowedLangs = getAllowedLanguages(plan);
      if (configFields.language && !allowedLangs.includes(configFields.language as LanguageCode)) {
        configFields.language = allowedLangs[0] || 'en';
      }
      const { language, voiceId } = { ...existing, ...configFields };
      if (language || voiceId) {
        const validation = validateVoiceConfig(
          plan,
          {
            language: language as LanguageCode | undefined,
            voiceProvider: 'openai' as VoiceProvider,
            voiceId: voiceId as string | undefined,
          },
          existing?.voiceId
        );
        if (!validation.valid) {
          return res.status(403).json({
            success: false,
            error: 'Voice configuration not allowed on your plan',
            details: validation.errors,
            currentPlan: plan,
          });
        }
      }

      const config = await aiConfigService.upsertConfig(
        tenantId,
        configFields,
        capabilities
      );
      const dashboardConfig = normalizeDashboardConfig(toDashboardConfig(config));

      await voiceRedis.setex(`ai_config:${tenantId}`, 300, JSON.stringify(dashboardConfig));

      await aiConfigWebSocketManager.broadcastConfigUpdate(tenantId, dashboardConfig);

      const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
      publishDashboardPushType(tenantId, 'config.updated');

      res.json({
        success: true,
        data: dashboardConfig,
      });
    })
  );

  /**
   * GET /api/v1/ai-config/system-prompt
   * Get generated system prompt
   */
  router.get(
    '/system-prompt',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing tenant ID',
        });
      }

      const prompt = await aiConfigService.buildSystemPrompt(tenantId);

      res.json({
        success: true,
        data: { prompt },
      });
    })
  );

  /**
   * GET /api/v1/ai-config/templates
   * Get prompt templates
   */
  router.get(
    '/templates',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const templateType = req.query.type as string;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing tenant ID',
        });
      }

      const templates = await aiConfigService.getPromptTemplates(
        tenantId,
        templateType
      );

      res.json({
        success: true,
        data: templates,
      });
    })
  );

  /**
   * POST /api/v1/ai-config/templates
   * Create prompt template
   */
  router.post(
    '/templates',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing tenant ID',
        });
      }

      const template = await aiConfigService.createPromptTemplate(
        tenantId,
        req.body
      );

      res.json({
        success: true,
        data: template,
      });
    })
  );

  /**
   * GET /api/v1/ai-config/scenarios
   * Get conversation scenarios
   */
  router.get(
    '/scenarios',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing tenant ID',
        });
      }

      const scenarios = await aiConfigService.getConversationScenarios(tenantId);

      res.json({
        success: true,
        data: scenarios,
      });
    })
  );

  /**
   * POST /api/v1/ai-config/test
   * Test AI configuration with sample input
   */
  router.post(
    '/test',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { userInput } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing tenant ID',
        });
      }

      if (!userInput) {
        return res.status(400).json({
          success: false,
          error: 'Missing user input',
        });
      }

      // Get config and build prompt
      const config = await aiConfigService.getConfig(tenantId);
      const systemPrompt = await aiConfigService.buildSystemPrompt(tenantId);

      // Check for matching scenario
      const scenario = await aiConfigService.matchScenario(tenantId, userInput);

      res.json({
        success: true,
        data: {
          config,
          systemPrompt,
          matchedScenario: scenario,
        },
      });
    })
  );

  return router;
}

