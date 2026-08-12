/**
 * Integrations Controller
 * Skeleton endpoints for third-party integrations (CRM, calendars, channels).
 * Real provider wiring lands in later phases; these return honest status state.
 */

import { Router } from 'express';
import { integrationService } from './integration.service.js';
import { channelsService } from '../channels/channels.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { voiceAuthUnlessPublic } from '../../middleware/voice-auth-unless-public.js';

function tenantOf(req: any): string | null {
  return (req.headers['x-tenant-id'] as string) || null;
}

export function createIntegrationsRouter(): Router {
  const router = Router();
  router.use(voiceAuthUnlessPublic);

  /**
   * GET /api/v1/integrations/status
   * Aggregate status of channel connections + provider availability.
   */
  router.get(
    '/status',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });

      const connections = await channelsService.listConnections(tenantId);

      const providers = [
        { provider: 'whatsapp', enabled: process.env.WHATSAPP_API_TOKEN ? true : false, connected: false },
        { provider: 'instagram', enabled: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN), connected: false },
        { provider: 'facebook', enabled: Boolean(process.env.FACEBOOK_ACCESS_TOKEN), connected: false },
        { provider: 'google_calendar', enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), connected: false },
        { provider: 'microsoft_calendar', enabled: Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET), connected: false },
        { provider: 'zapier', enabled: Boolean(process.env.ZAPIER_WEBHOOK_URL), connected: false },
      ];

      providers.forEach((provider) => {
        const conn = connections.find((c) => c.channel === provider.provider);
        if (conn) {
          provider.enabled = true;
          provider.connected = conn.status === 'connected';
        }
      });

      res.json({ success: true, data: providers, count: providers.length });
    })
  );

  /**
   * POST /api/v1/integrations/:provider/test
   * Skeleton ping for a provider — no-op until real wiring ships.
   */
  router.post(
    '/:provider/test',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const provider = req.params.provider as string;
      await integrationService.sendRealtime(tenantId, { provider, test: true, at: new Date().toISOString() });
      res.json({
        success: true,
        data: { provider, connected: false, message: `${provider} integration is a skeleton — wiring ships in a later phase.` },
      });
    })
  );

  return router;
}
