/**
 * Custom Webhooks Controller
 * REST endpoints for managing user-defined webhooks.
 */

import { customWebhooksService } from './webhooks.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import { getTenantId } from '../auth/tenant-context.js';
import express from 'express';

/** Verified tenant from the authenticated JWT/internal-key context, not the raw header. */
function getTenantScope(req: Request): string {
  return getTenantId(req);
}

export function createWebhooksRouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get(
    '/',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const webhooks = await customWebhooksService.list(tenantId);
      res.json({ success: true, data: webhooks });
    })
  );

  router.post(
    '/',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { name, url, events, headers } = req.body;

      if (!name || !url || !events || !Array.isArray(events)) {
        return res.status(400).json({ success: false, error: 'name, url, and events[] are required' });
      }

      const webhook = await customWebhooksService.create(tenantId, { name, url, events, headers });
      res.status(201).json({ success: true, data: webhook });
    })
  );

  router.put(
    '/:id',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { id } = req.params;
      const webhook = await customWebhooksService.update(tenantId, id, req.body);
      res.json({ success: true, data: webhook });
    })
  );

  router.delete(
    '/:id',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { id } = req.params;
      await customWebhooksService.delete(tenantId, id);
      res.json({ success: true, message: 'Webhook deleted' });
    })
  );

  router.get(
    '/:id/deliveries',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const deliveries = await customWebhooksService.getDeliveries(tenantId, id, limit);
      res.json({ success: true, data: deliveries });
    })
  );

  router.post(
    '/:id/test',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      await customWebhooksService.dispatchEvent(tenantId, 'test.ping', { message: 'This is a test webhook from Halla AI' });
      res.json({ success: true, message: 'Test webhook dispatched' });
    })
  );

  return router;
}

