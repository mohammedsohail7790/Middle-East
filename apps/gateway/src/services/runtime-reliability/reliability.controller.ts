import express from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { requireTenant } from '../../middleware/require-tenant.js';
import { getTenantId } from '../auth/tenant-context.js';
import { buildRuntimeReliabilityReport } from './reliability-intelligence.service.js';

export function createRuntimeReliabilityRouter(): express.Router {
  const router = express.Router();
  router.use(requireTenant);

  router.get(
    '/report',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      res.json({ success: true, data: await buildRuntimeReliabilityReport(tenantId) });
    })
  );

  return router;
}
