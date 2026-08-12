/**
 * Channels Controller
 * API endpoints for channel connection status (WhatsApp, Web Chat, Instagram, Facebook).
 */

import { Router } from 'express';
import { channelsService, CHANNEL_TYPES } from './channels.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import { voiceAuthUnlessPublic } from '../../middleware/voice-auth-unless-public.js';
import {
  channelParamSchema,
  channelUpsertBodySchema,
} from '../../security/validation-schemas.js';

function tenantOf(req: any): string | null {
  return (req.headers['x-tenant-id'] as string) || null;
}

export function createChannelsRouter(): Router {
  const router = Router();
  router.use(voiceAuthUnlessPublic);

  router.get(
    '/',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const connections = await channelsService.listConnections(tenantId);
      res.json({ success: true, data: connections, count: connections.length });
    })
  );

  router.get(
    '/:channel',
    validate(channelParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const connection = await channelsService.getConnection(tenantId, req.params.channel);
      if (!connection) {
        return res.json({
          success: true,
          data: { channel: req.params.channel, status: 'not_connected', config: {} },
        });
      }
      res.json({ success: true, data: connection });
    })
  );

  router.put(
    '/:channel',
    validate(channelUpsertBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const connection = await channelsService.upsertConnection(tenantId, req.params.channel, req.body);
      res.json({ success: true, data: connection });
    })
  );

  router.delete(
    '/:channel',
    validate(channelParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const deleted = await channelsService.deleteConnection(tenantId, req.params.channel);
      if (!deleted) return res.status(404).json({ error: 'Channel not found' });
      res.json({ success: true, message: 'Channel connection removed' });
    })
  );

  router.get(
    '/meta/types',
    asyncHandler(async (_req: any, res: any) => {
      res.json({ success: true, data: CHANNEL_TYPES });
    })
  );

  return router;
}
