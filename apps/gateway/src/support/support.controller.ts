import express from 'express';
import { asyncHandler } from '../middleware/index.js';
import { requireTenant } from '../middleware/require-tenant.js';
import { getTenantId } from '../services/auth/tenant-context.js';
import { buildTenantDiagnosticsPack } from './support-diagnostics.service.js';
import { evaluateAnomalies } from '../observability/anomaly-detection/anomaly-detector.js';
import { tuneAlerts, correlateAlerts } from '../observability/alerts/alert-tuning.service.js';
import { adviseScaling } from '../observability/scaling/scaling-advisor.js';
import { evaluateBackpressure } from '../infrastructure/backpressure.js';
import { scoreScaleConfidence } from '../validation/scale-confidence.service.js';

export function createSupportRouter(): express.Router {
  const router = express.Router();
  router.use(requireTenant);

  router.get(
    '/diagnostics',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      res.json({ success: true, data: await buildTenantDiagnosticsPack(tenantId) });
    })
  );

  router.get(
    '/alerts-tuned',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const raw = await evaluateAnomalies(tenantId);
      const tuned = tuneAlerts(raw, tenantId);
      res.json({
        success: true,
        data: { alerts: tuned, correlated: correlateAlerts(tuned) },
      });
    })
  );

  router.get(
    '/scaling-advice',
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await adviseScaling() });
    })
  );

  router.get(
    '/backpressure',
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: evaluateBackpressure() });
    })
  );

  router.get(
    '/scale-confidence',
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await scoreScaleConfidence() });
    })
  );

  return router;
}
