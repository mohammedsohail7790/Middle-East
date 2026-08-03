import express from 'express';
import { asyncHandler } from '../middleware/index.js';
import { requireTenant } from '../middleware/require-tenant.js';
import { getTenantId, type CallIqAuthenticatedRequest } from '../services/auth/tenant-context.js';
import { evaluateAutoRecovery } from './auto-recovery/auto-recovery.service.js';
import { getReplayStatus, requestDlqReplay } from './replay-orchestration/replay.service.js';
import { routeOperationalAlerts } from './alert-routing/alert-router.service.js';
import { buildRemediationPlan } from './remediation/remediation.service.js';

export function createOperationsRouter(): express.Router {
  const router = express.Router();
  router.use(requireTenant);

  router.get(
    '/recovery',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      res.json({ success: true, data: await evaluateAutoRecovery(tenantId) });
    })
  );

  router.get(
    '/replay-status',
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await getReplayStatus() });
    })
  );

  router.post(
    '/replay-dlq',
    asyncHandler(async (req, res) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      res.json({
        success: true,
        data: await requestDlqReplay(tenantId, r.tenant?.userId),
      });
    })
  );

  router.get(
    '/alerts',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      res.json({ success: true, data: await routeOperationalAlerts(tenantId) });
    })
  );

  router.post(
    '/remediation-plan',
    asyncHandler(async (req, res) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const approved = req.body?.approved === true;
      res.json({
        success: true,
        data: await buildRemediationPlan(tenantId, r.tenant?.userId, approved),
      });
    })
  );

  return router;
}
