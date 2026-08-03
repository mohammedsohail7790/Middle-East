/**
 * Phone Provisioning Controller
 * REST endpoints for searching, purchasing, and releasing Twilio phone numbers.
 */

import { phoneProvisioningService } from './phoneProvisioning.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { getTenantId } from '../auth/tenant-context.js';
import { logger } from '../../services/logger.js';
import express from 'express';

function getTenantScope(req: Request): string {
  return getTenantId(req);
}

export function createPhoneNumbersRouter(): express.Router {
  const router = express.Router();
  router.use(requireVoiceApiAccess);

  // List all phone numbers for the authenticated tenant
  router.get(
    '/',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const numbers = await phoneProvisioningService.listNumbers(tenantId);
      const stats = await phoneProvisioningService.getTenantNumberStats(tenantId);
      res.json({ success: true, data: { numbers, stats } });
    })
  );

  // Search available numbers by area code
  router.get(
    '/search',
    asyncHandler(async (req: any, res: any) => {
      const areaCode = req.query.areaCode as string;
      if (!areaCode) {
        return res.status(400).json({ success: false, error: 'areaCode query parameter is required' });
      }
      try {
        const numbers = await phoneProvisioningService.searchAvailable(areaCode, 10);
        res.json({ success: true, data: { numbers } });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('Phone number search failed', { areaCode, error: message });
        res.status(503).json({ success: false, error: message });
      }
    })
  );

  // Get plan limits/stats
  router.get(
    '/stats',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const stats = await phoneProvisioningService.getTenantNumberStats(tenantId);
      res.json({ success: true, data: stats });
    })
  );

  // Purchase a phone number
  router.post(
    '/purchase',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ success: false, error: 'phoneNumber is required' });
      }

      logger.info('Phone number purchase requested', { tenantId, phoneNumber });
      try {
        const result = await phoneProvisioningService.purchaseNumber(tenantId, phoneNumber);
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('Phone number purchase failed', { tenantId, phoneNumber, error: message });
        const status = /not configured|Twilio/i.test(message) ? 503 : 400;
        res.status(status).json({ success: false, error: message });
      }
    })
  );

  // Release a phone number
  router.delete(
    '/:numberId',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { numberId } = req.params;
      await phoneProvisioningService.releaseNumber(tenantId, numberId);
      res.json({ success: true, message: 'Phone number released' });
    })
  );

  router.patch(
    '/:id/agent',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { aiAgentId } = req.body;
      await phoneProvisioningService.assignAgent(
        tenantId,
        req.params.id,
        aiAgentId ? String(aiAgentId) : null
      );
      res.json({ success: true });
    })
  );

  router.get(
    '/port',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { listPortRequests } = await import('./phonePorting.service.js');
      const data = await listPortRequests(tenantId);
      res.json(data);
    })
  );

  router.get(
    '/port-requests',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { listPortRequests } = await import('./phonePorting.service.js');
      const data = await listPortRequests(tenantId);
      res.json(data);
    })
  );

  router.post(
    '/port',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { createPortRequest } = await import('./phonePorting.service.js');
      const data = await createPortRequest(tenantId, req.body || {});
      res.status(201).json(data);
    })
  );

  router.post(
    '/port-requests',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { createPortRequest } = await import('./phonePorting.service.js');
      const data = await createPortRequest(tenantId, req.body || {});
      res.status(201).json(data);
    })
  );

  router.get(
    '/port/:id',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { getPortRequest, pollPortStatus } = await import('./phonePorting.service.js');
      const data = await pollPortStatus(tenantId, req.params.id);
      res.json(data || (await getPortRequest(tenantId, req.params.id)));
    })
  );

  router.get(
    '/port-requests/:id',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { getPortRequest, pollPortStatus } = await import('./phonePorting.service.js');
      const data = await pollPortStatus(tenantId, req.params.id);
      res.json(data || (await getPortRequest(tenantId, req.params.id)));
    })
  );

  router.post(
    '/port-requests/:id/cancel',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { cancelPortRequest } = await import('./phonePorting.service.js');
      const data = await cancelPortRequest(tenantId, req.params.id);
      res.json(data);
    })
  );

  router.post(
    '/port/:id/loa',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { attachLoaDocument } = await import('./phonePorting.service.js');
      const url = String(req.body?.loaDocumentUrl || '');
      if (!url) return res.status(400).json({ success: false, error: 'loaDocumentUrl required' });
      const data = await attachLoaDocument(tenantId, req.params.id, url);
      res.json(data);
    })
  );

  router.post(
    '/port/:id/submit',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { submitPortRequest } = await import('./phonePorting.service.js');
      const data = await submitPortRequest(tenantId, req.params.id);
      res.json(data);
    })
  );

  return router;
}

