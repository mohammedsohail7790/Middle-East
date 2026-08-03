import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.js';
import { trialManager } from '../services/billing/trial.service.js';
import { billingService, type Subscription } from '../services/billing/billing.service.js';
import { CacheHelpers } from '../services/cache.js';

/**
 * Same 15s-TTL cache key the realtime WS-session gate uses
 * (realtime.gateway.ts) — this call happens first, at the /incoming-call
 * webhook, so populating this cache here means the later WS-session check
 * for the same call gets an instant hit instead of a second cross-region
 * DB round trip.
 */
async function getCachedActiveSubscription(tenantId: string): Promise<Subscription | null> {
  const sub = await CacheHelpers.cacheDatabaseQuery(
    `billing:active-sub:${tenantId}`,
    () => billingService.getActiveSubscription(tenantId),
    { ttl: 15 }
  );
  if (sub) {
    sub.currentPeriodStart = new Date(sub.currentPeriodStart);
    sub.currentPeriodEnd = new Date(sub.currentPeriodEnd);
    sub.createdAt = new Date(sub.createdAt);
    sub.updatedAt = new Date(sub.updatedAt);
  }
  return sub;
}

export interface EnforcementResult {
  allowed: boolean;
  reason?: string;
  blockType?: 'trial_expired' | 'trial_minutes' | 'usage_limit' | 'no_subscription';
}

/**
 * Middleware to block calls when trial has expired or minutes are exhausted.
 * Used in the voice WebSocket connection path.
 */
export async function enforceCallAllowed(tenantId: string): Promise<EnforcementResult> {
  const sub = await getCachedActiveSubscription(tenantId);

  if (!sub) {
    logger.warn('Call blocked: no active subscription', { tenantId });
    return { allowed: false, reason: 'No active subscription', blockType: 'no_subscription' };
  }

  // Trial users: check time + minute limits
  if (sub.status === 'trialing') {
    const trialBlock = await trialManager.isTrialBlocked(tenantId);
    if (trialBlock.blocked) {
      await trialManager.expireTrialIfNeeded(tenantId);
      logger.warn('Call blocked by trial limits', { tenantId, reason: trialBlock.reason });
      const status = await trialManager.getTrialStatus(tenantId);
      return {
        allowed: false,
        reason: trialBlock.reason!,
        blockType: status.trialMinutesExhausted ? 'trial_minutes' : 'trial_expired',
      };
    }
    return { allowed: true };
  }

  if (sub.status === 'paused') {
    return {
      allowed: false,
      reason: 'Your free trial has ended. Upgrade to restore your AI receptionist.',
      blockType: 'trial_expired',
    };
  }

  // Active subscribers: check usage allowance
  const usageCheck = await billingService.checkUsageAllowance(tenantId, sub);
  if (!usageCheck.allowed) {
    logger.warn('Call blocked by usage limit', { tenantId, used: usageCheck.usedMinutes, limit: usageCheck.limitMinutes });
    return {
      allowed: false,
      reason: usageCheck.reason || 'Usage limit reached',
      blockType: 'usage_limit',
    };
  }

  return { allowed: true };
}

/**
 * Express middleware to check call allowance on voice WebSocket connections.
 */
export function requireCallAllowance(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.header('x-tenant-id') || req.params.tenantId;
  if (!tenantId) {
    res.status(400).json({ success: false, error: 'Missing tenant ID' });
    return;
  }

  enforceCallAllowed(tenantId).then((result) => {
    if (!result.allowed) {
      res.status(403).json({
        success: false,
        error: result.reason,
        blockType: result.blockType,
        upgradeUrl: '/billing/subscription',
      });
      return;
    }
    next();
  }).catch((error) => {
    logger.error('USAGE_ENFORCEMENT_CHECK_FAILED', { tenantId, error: String(error) });
    if (process.env.USAGE_ENFORCEMENT_FAIL_OPEN === 'true') {
      logger.warn('USAGE_ENFORCEMENT_FAIL_OPEN_OVERRIDE', { tenantId });
      next();
      return;
    }
    // Fail closed by default — better to block a call than to allow unlimited usage during billing outage
    res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again in a moment.',
    });
  });
}
