import { Router } from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { getTenantFlags, isFlagEnabled } from './feature-flags.service.js';
import { requireTenant } from '../../middleware/require-tenant.js';
import { getTenantId } from '../auth/tenant-context.js';
import type { CallIqAuthenticatedRequest } from '../auth/tenant-context.js';

export function createFeatureFlagsRouter(): Router {
  const router = Router();

  router.get(
    '/',
    requireTenant,
    asyncHandler(async (req, res) => {
      const authReq = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const plan = (authReq.tenant as any)?.subscription_plan || (authReq.tenant as any)?.plan;
      const flags = await getTenantFlags(tenantId, plan);
      res.json({ success: true, data: { flags } });
    })
  );

  router.get(
    '/:flag',
    requireTenant,
    asyncHandler(async (req, res) => {
      const authReq = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const plan = (authReq.tenant as any)?.subscription_plan || (authReq.tenant as any)?.plan;
      const { flag } = req.params;
      const enabled = await isFlagEnabled(tenantId, flag, plan);
      res.json({ success: true, data: { flag, enabled } });
    })
  );

  return router;
}
