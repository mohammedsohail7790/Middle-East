/**
 * Plan Gating Middleware
 * Centralized plan-based access control for all gateway endpoints.
 */

import type { Request, Response, NextFunction } from 'express';
import { billingService } from '../services/billing/billing.service.js';
import { logger } from '../services/logger.js';
import { resolveTenantId } from './resolve-tenant-id.js';

function tenantFromRequest(req: Request, res: Response): string | null {
  try {
    return resolveTenantId(req);
  } catch {
    res.status(400).json({ success: false, error: 'Tenant context missing' });
    return null;
  }
}

export function requirePlan(feature: 'customVoice' | 'hipaa' | 'sla' | 'advancedAnalytics' | 'apiAccess') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = tenantFromRequest(req, res);
    if (!tenantId) return;

    const allowed = await billingService.canUseFeature(tenantId, feature);
    if (!allowed) {
      const sub = await billingService.getActiveSubscription(tenantId);
      logger.warn('Plan feature denied', { tenantId, feature, plan: sub?.plan });
      const error =
        feature === 'customVoice'
          ? 'This feature requires a Professional plan or higher'
          : 'This feature is not currently available on any plan';
      return res.status(403).json({
        success: false,
        error,
        requiredFeature: feature,
        currentPlan: sub?.plan || 'none',
      });
    }

    next();
  };
}

export function requireProfessionalOrHigher() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = tenantFromRequest(req, res);
    if (!tenantId) return;

    const sub = await billingService.getActiveSubscription(tenantId);
    if (!sub) {
      return res.status(403).json({ success: false, error: 'No active subscription' });
    }

    if (sub.status === 'trialing') {
      return next();
    }

    const rank = await billingService.getPlanRank(sub.plan);
    if (rank < 2) {
      return res.status(403).json({
        success: false,
        error: 'This feature requires a Professional plan or higher',
        currentPlan: sub.plan,
      });
    }

    next();
  };
}

/** Starter / Essential tier — outbound calling, campaigns, phone numbers. */
export function requireEssentialOrHigher() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = tenantFromRequest(req, res);
    if (!tenantId) return;

    const sub = await billingService.getActiveSubscription(tenantId);
    if (!sub) {
      return res.status(403).json({ success: false, error: 'No active subscription' });
    }

    if (sub.status === 'trialing') {
      return next();
    }

    const rank = await billingService.getPlanRank(sub.plan);
    if (rank < 1) {
      return res.status(403).json({
        success: false,
        error: 'This feature requires a Starter plan or higher',
        currentPlan: sub.plan,
      });
    }

    next();
  };
}

export function requireCallMinutes() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = tenantFromRequest(req, res);
    if (!tenantId) return;

    const check = await billingService.checkUsageAllowance(tenantId);
    if (!check.allowed) {
      const sub = await billingService.getActiveSubscription(tenantId);
      return res.status(403).json({
        success: false,
        error: check.reason || 'Call minute limit reached',
        currentPlan: sub?.plan || 'none',
        usedMinutes: check.usedMinutes,
        limitMinutes: check.limitMinutes,
      });
    }

    next();
  };
}

export function requireCrmAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = tenantFromRequest(req, res);
    if (!tenantId) return;

    const summary = await billingService.getFeatureSummary(tenantId);
    if (summary.crm === 'none') {
      const sub = await billingService.getActiveSubscription(tenantId);
      return res.status(403).json({
        success: false,
        error: 'CRM integration is not available on your plan. Upgrade to Professional or higher.',
        currentPlan: sub?.plan || 'none',
      });
    }

    next();
  };
}

export function requireCalendarSync() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = tenantFromRequest(req, res);
    if (!tenantId) return;

    const summary = await billingService.getFeatureSummary(tenantId);
    if (summary.calendar === 'basic') {
      const sub = await billingService.getActiveSubscription(tenantId);
      return res.status(403).json({
        success: false,
        error: 'Native calendar sync requires a Professional plan or higher.',
        currentPlan: sub?.plan || 'none',
      });
    }

    next();
  };
}
