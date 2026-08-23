import express from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { requireTenant } from '../../middleware/require-tenant.js';
import { getTenantId } from '../auth/tenant-context.js';
import { getTenantBillingIntelligence, getUsageRollup } from './billing-intelligence.service.js';
import { buildBillingForecast } from './billing-forecast.service.js';
import { scoreRuntimeCostEfficiency } from './cost-efficiency.service.js';
import { billingService } from './billing.service.js';
import { getPlanConfig } from '../../config/plan-config.js';

export function createBillingIntelligenceRouter(): express.Router {
  const router = express.Router();
  router.use(requireTenant);

  router.get(
    '/summary',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const subscriptionAmount = Number(req.query.subscription || 0);
      const sub = await billingService.getActiveSubscription(tenantId);
      const plan = sub?.status === 'trialing' ? 'trial' : (sub?.plan || 'essential');
      const planConfig = getPlanConfig(plan);
      const usage = await billingService.getCurrentUsage(tenantId);
      const intelligence = await getTenantBillingIntelligence(tenantId, plan, subscriptionAmount);
      res.json({
        success: true,
        data: {
          ...intelligence,
          minutesLimit: planConfig.includedMinutes,
          minutesUsed: usage.callMinutes,
        },
      });
    })
  );

  router.get(
    '/forecast',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const subscription = Number(req.query.subscription || 0);
      res.json({
        success: true,
        data: await buildBillingForecast(tenantId, subscription),
      });
    })
  );

  router.get(
    '/usage',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      res.json({ success: true, data: await getUsageRollup(tenantId) });
    })
  );

  router.get(
    '/efficiency',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const sub = Number(req.query.subscription || 0);
      res.json({ success: true, data: await scoreRuntimeCostEfficiency(tenantId, sub) });
    })
  );

  return router;
}
