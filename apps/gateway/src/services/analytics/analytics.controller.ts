/**
 * Analytics Controller — Plan-Gated
 *
 * Basic metrics (all plans): /metrics, /call-volume, /peak-hours
 * Advanced analytics (Enterprise only): /conversion-funnel, /export
 */

import { analyticsService } from './analytics.service.js';
import { billingService } from '../billing/billing.service.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { getTenantId } from '../auth/tenant-context.js';
import { Router } from 'express';
import { clientErrorMessage } from '../../security/safe-error.js';

async function requireAdvancedAnalytics(tenantId: string, res: Response): Promise<boolean> {
  const sub = await billingService.getActiveSubscription(tenantId);
  if (!sub) {
    res.status(403).json({
      success: false,
      error: 'Active subscription required for analytics export',
      currentPlan: 'none',
    });
    return false;
  }
  if (
    sub.status === 'trialing' ||
    sub.plan === 'trial' ||
    sub.plan === 'professional'
  ) {
    return true;
  }
  const allowed = await billingService.canUseFeature(tenantId, 'advancedAnalytics');
  if (!allowed) {
    res.status(403).json({
      success: false,
      error: 'Advanced analytics requires a Professional plan or higher',
      currentPlan: sub.plan,
    });
    return false;
  }
  return true;
}

function resolveTenantId(req: any, res: any): string | null {
  try {
    return getTenantId(req);
  } catch {
    res.status(400).json({ success: false, error: 'Tenant ID required' });
    return null;
  }
}

function requireDates(req: any, res: any): boolean {
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  if (!startDate || !endDate) {
    res.status(400).json({ success: false, error: 'Start date and end date required' });
    return false;
  }
  return true;
}

const router = Router();
router.use(requireVoiceApiAccess);

/**
 * GET /api/v1/analytics/metrics — Basic dashboard metrics (all plans)
 */
router.get('/metrics', async (req: any, res: any) => {
  const tenantId = resolveTenantId(req, res);
  if (!tenantId) return;
  if (!requireDates(req, res)) return;

  try {
    const metrics = await analyticsService.getDashboardMetrics(
      tenantId,
      new Date(req.query.startDate as string),
      new Date(req.query.endDate as string)
    );
    res.json({ success: true, data: metrics });
  } catch (error: any) {
    console.error('[Analytics API] Error getting metrics:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to get metrics') });
  }
});

/**
 * GET /api/v1/analytics/call-volume — Basic call volume (all plans)
 */
router.get('/call-volume', async (req: any, res: any) => {
  const tenantId = resolveTenantId(req, res);
  if (!tenantId) return;
  if (!requireDates(req, res)) return;

  try {
    const data = await analyticsService.getCallVolumeByDate(
      tenantId,
      new Date(req.query.startDate as string),
      new Date(req.query.endDate as string)
    );
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('[Analytics API] Error getting call volume:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to get call volume') });
  }
});

/**
 * GET /api/v1/analytics/peak-hours — Basic peak hours (all plans)
 */
router.get('/peak-hours', async (req: any, res: any) => {
  const tenantId = resolveTenantId(req, res);
  if (!tenantId) return;
  if (!requireDates(req, res)) return;

  try {
    const data = await analyticsService.getPeakHours(
      tenantId,
      new Date(req.query.startDate as string),
      new Date(req.query.endDate as string)
    );
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('[Analytics API] Error getting peak hours:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to get peak hours') });
  }
});

/**
 * GET /api/v1/analytics/conversion-funnel — Advanced analytics (Enterprise only)
 */
router.get('/conversion-funnel', async (req: any, res: any) => {
  const tenantId = resolveTenantId(req, res);
  if (!tenantId) return;
  if (!requireDates(req, res)) return;
  if (!await requireAdvancedAnalytics(tenantId, res)) return;

  try {
    const data = await analyticsService.getConversionFunnel(
      tenantId,
      new Date(req.query.startDate as string),
      new Date(req.query.endDate as string)
    );
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('[Analytics API] Error getting conversion funnel:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to get conversion funnel') });
  }
});

/**
 * GET /api/v1/analytics/export — Advanced analytics (Enterprise only)
 */
router.get('/export', async (req: any, res: any) => {
  const tenantId = resolveTenantId(req, res);
  if (!tenantId) return;
  if (!requireDates(req, res)) return;
  if (!await requireAdvancedAnalytics(tenantId, res)) return;

  try {
    const start = new Date(req.query.startDate as string);
    const end = new Date(req.query.endDate as string);
    const format = String(req.query.format || 'csv').toLowerCase();

    if (format === 'pdf') {
      const pdf = await analyticsService.exportToPDF(tenantId, start, end);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=calliq-analytics.pdf');
      res.send(pdf);
      return;
    }

    const csv = await analyticsService.exportToCSV(tenantId, start, end);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
    res.send(csv);
  } catch (error: any) {
    console.error('[Analytics API] Error exporting data:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to export data') });
  }
});

/**
 * POST /api/v1/analytics/calculate-daily — Internal/cron (all plans)
 */
router.post('/calculate-daily', async (req: any, res: any) => {
  const tenantId = resolveTenantId(req, res);
  if (!tenantId) return;

  const { date } = req.body;
  if (!date) {
    return res.status(400).json({ success: false, error: 'Date required' });
  }

  try {
    await analyticsService.calculateDailyMetrics(tenantId, new Date(date));
    res.json({ success: true, message: 'Daily metrics calculated successfully' });
  } catch (error: any) {
    console.error('[Analytics API] Error calculating daily metrics:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to calculate daily metrics') });
  }
});

export function createAnalyticsRouter(): Router {
  return router;
}

