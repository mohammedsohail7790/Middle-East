/**
 * Billing Controller — Production-Ready
 * API endpoints for billing, subscriptions, usage, feature gating, overage,
 * trial management, warnings, billing portal, and minute accounting.
 */

import { billingService, PLANS } from './billing.service.js';
import { parseBillingInterval, isStripeConfigured } from './stripe-catalog.js';
import { BillingNotConfiguredError } from './billing-errors.js';
import { trialManager } from './trial.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import { billingCheckoutBodySchema } from '../../security/validation-schemas.js';
import { voiceAuthUnlessPublic } from '../../middleware/voice-auth-unless-public.js';
import { logger } from '../logger.js';
import Stripe from 'stripe';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { PLAN_FEATURES, SUPPORTED_LANGUAGES, VOICE_RULES, getAllowedLanguages, getPlanConfig } from '../../config/plan-config.js';
import { getDashboardBaseUrl } from '../integrations/oauth-redirect.js';
import { getTenantId, type CallIqAuthenticatedRequest } from '../auth/tenant-context.js';
import { resolveUserRole, requirePermission } from '../enterprise/rbac.service.js';
import type {
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

/**
 * Live account/subscription state must never be served via HTTP 304.
 * Express auto-generates a weak ETag for every JSON response by default;
 * if a client replays that ETag as If-None-Match, Express short-circuits
 * to an empty 304 body -- silently reusing whatever was cached from an
 * earlier request. For a billing-gating endpoint (dashboard lock/unlock,
 * plan, trial status) that meant a dashboard could keep showing a stale
 * "unlocked" snapshot from before a trial expired until something (e.g.
 * clicking "Upgrade Now") happened to bypass the cache. Stripping the
 * incoming conditional-request headers here means Express's freshness
 * check (`req.fresh`) always evaluates false, so it can never downgrade
 * to 304 for these routes -- callers always get the real, current state.
 */
function noConditionalCache(req: ExpressRequest, res: ExpressResponse, next: NextFunction): void {
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-08-26.dahlia',
    })
  : null;

export function createBillingRouter(): Router {
  const router = Router();
  router.use(voiceAuthUnlessPublic);

  // ── Plans ───────────────────────────────────────────────────────────────

  router.get(
    '/plans',
    asyncHandler(async (_req: Request, res: Response) => {
      const data = await billingService.getPublicPlans();
      const checkoutEnabled = Object.values(data).some(
        (p) => (p as { checkoutReady?: boolean }).checkoutReady === true
      );
      res.json({
        success: true,
        data,
        meta: {
          stripeConfigured: isStripeConfigured(),
          checkoutEnabled,
        },
      });
    })
  );

  router.get(
    '/status',
    asyncHandler(async (_req: Request, res: Response) => {
      const plans = await billingService.getPublicPlans();
      const checkoutEnabled = Object.values(plans).some(
        (p) => (p as { checkoutReady?: boolean }).checkoutReady === true
      );
      res.json({
        success: true,
        data: {
          stripeConfigured: isStripeConfigured(),
          checkoutEnabled,
          message: !isStripeConfigured()
            ? 'Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET on the Render gateway, then redeploy.'
            : checkoutEnabled
              ? 'Stripe checkout is ready.'
              : 'Stripe is connected but plan prices could not be resolved — check product IDs in Stripe.',
        },
      });
    })
  );

  // ── Subscription ────────────────────────────────────────────────────────

  router.get(
    '/subscription',
    noConditionalCache,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const subscription = await billingService.getSubscription(tenantId);
      res.json({ success: true, data: subscription });
    })
  );

  router.post(
    '/subscription',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      const { email, name, plan, paymentMethodId } = req.body;

      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });
      if (!email || !name || !plan) return res.status(400).json({ success: false, error: 'Missing required fields: email, name, plan' });
      if (!PLANS[plan]) {
        return res.status(400).json({
          success: false,
          error: `Invalid plan. Must be one of: ${Object.keys(PLANS).join(', ')}`,
        });
      }

      const subscription = await billingService.createSubscription(tenantId, email, name, plan, paymentMethodId);
      logger.info('Subscription created via API', { tenantId, plan });
      res.json({ success: true, data: subscription });
    })
  );

  router.put(
    '/subscription/plan',
    asyncHandler(async (req: any, res: any) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const { plan } = req.body;

      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });
      if (!plan || !PLANS[plan]) {
        return res.status(400).json({
          success: false,
          error: `Invalid plan. Must be one of: ${Object.keys(PLANS).join(', ')}`,
        });
      }

      const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(userRole, 'billing:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      const subscription = await billingService.updateSubscriptionPlan(tenantId, plan);
      logger.info('Subscription plan updated via API', { tenantId, plan });
      res.json({ success: true, data: subscription });
    })
  );

  router.delete(
    '/subscription',
    asyncHandler(async (req: any, res: any) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(userRole, 'billing:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      const immediately = req.query.immediately === 'true';
      const subscription = await billingService.cancelSubscription(tenantId, immediately);
      logger.info('Subscription canceled via API', { tenantId, immediately });
      res.json({ success: true, data: subscription });
    })
  );

  // ── Usage ───────────────────────────────────────────────────────────────

  router.get(
    '/usage',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const usage = await billingService.getCurrentUsage(tenantId);
      const subscription = await billingService.getSubscription(tenantId);
      const overage = await billingService.calculateOverage(tenantId);

      let limits = null;
      if (subscription && PLANS[subscription.plan]) {
        const planDetails = PLANS[subscription.plan];
        limits = {
          ...planDetails.features,
          overageRate: planDetails.overageRate,
          includedMinutes: planDetails.includedMinutes,
        };
      }

      res.json({
        success: true,
        data: {
          usage,
          limits,
          overage,
          subscription: subscription ? {
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
          } : null,
        },
      });
    })
  );

  router.post(
    '/usage',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      const { type, quantity } = req.body;

      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });
      if (!type || typeof quantity !== 'number') return res.status(400).json({ success: false, error: 'Missing required fields: type, quantity' });

      const usage = await billingService.trackUsage(tenantId, type, quantity);
      res.json({ success: true, data: usage });
    })
  );

  // ── Overage ─────────────────────────────────────────────────────────────

  router.get(
    '/overage',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const overage = await billingService.calculateOverage(tenantId);
      res.json({ success: true, data: overage });
    })
  );

  // ── Feature Gating ──────────────────────────────────────────────────────

  router.post(
    '/feature-check',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      const { feature } = req.body;

      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });
      if (!feature) return res.status(400).json({ success: false, error: 'Missing required field: feature' });

      const allowed = await billingService.canUseFeature(tenantId, feature);
      res.json({ success: true, data: { feature, allowed } });
    })
  );

  router.get(
    '/phone-limit',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const summary = await billingService.getFeatureSummary(tenantId);
      res.json({ success: true, data: { plan: summary.plan, customVoice: summary.customVoice } });
    })
  );

  // ── Invoices ────────────────────────────────────────────────────────────

  router.get(
    '/invoices',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 12));
      const invoices = await billingService.getInvoices(tenantId, limit);
      res.json({ success: true, data: invoices, count: invoices.length });
    })
  );

  // ── Payment Intent ──────────────────────────────────────────────────────

  router.post(
    '/create-payment-intent',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      if (!stripe) {
        return res.status(503).json({ success: false, error: 'Billing not configured — STRIPE_SECRET_KEY missing' });
      }

      const { amount = 0, currency = 'usd' } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency,
        setup_future_usage: 'off_session',
        metadata: { tenantId },
      });

      res.json({ success: true, data: { clientSecret: paymentIntent.client_secret } });
    })
  );

  // ── Webhook ─────────────────────────────────────────────────────────────

  router.post('/webhook', (_req, res) => {
    res.status(400).json({
      success: false,
      error: 'Use POST /api/v1/billing/webhook with raw body (registered before JSON parser)',
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // NEW ENDPOINTS: Trial, Warnings, Billing Portal, Minute Accounting
  // ═══════════════════════════════════════════════════════════════════════

  // ── Trial Status ─────────────────────────────────────────────────────

  router.post(
    '/start-trial',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      await billingService.provisionFreeTrial(tenantId);
      const state = await billingService.getAccountState(tenantId);
      res.json({ success: true, data: state });
    })
  );

  router.get(
    '/trial',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const trialStatus = await trialManager.getTrialStatus(tenantId);
      res.json({ success: true, data: trialStatus });
    })
  );

  // ── Warnings ─────────────────────────────────────────────────────────

  router.get(
    '/warnings',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const unacknowledged = req.query.unacknowledged === 'true';
      const warnings = await trialManager.getWarnings(tenantId, unacknowledged);
      res.json({ success: true, data: warnings });
    })
  );

  router.post(
    '/warnings/acknowledge',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const { warningId } = req.body;
      if (warningId) {
        await trialManager.acknowledgeWarning(tenantId, warningId);
      } else {
        await trialManager.acknowledgeAllWarnings(tenantId);
      }
      res.json({ success: true });
    })
  );

  // ── Check & Generate Warnings ────────────────────────────────────────

  router.post(
    '/warnings/check',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const trialWarnings = await trialManager.checkAndGenerateWarnings(tenantId);
      const planWarnings = await trialManager.checkAndGeneratePlanWarnings(tenantId);
      const allWarnings = await trialManager.getWarnings(tenantId, true);

      res.json({
        success: true,
        data: {
          newWarnings: [...trialWarnings, ...planWarnings],
          activeWarnings: allWarnings,
        },
      });
    })
  );

  // ── Billing Portal (Stripe Customer Portal) ──────────────────────────

  router.post(
    '/portal',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      if (!stripe) {
        return res.status(503).json({ success: false, error: 'Billing not configured' });
      }

      const subscription = await billingService.getSubscription(tenantId);
      if (!subscription?.stripeCustomerId) {
        return res.status(400).json({ success: false, error: 'No Stripe customer found' });
      }

      const returnUrl = req.body.returnUrl || `${getDashboardBaseUrl()}/dashboard/billing`;
      const session = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: returnUrl,
      });

      res.json({ success: true, data: { url: session.url } });
    })
  );

  // ── Minute Accounting (per-call granular) ────────────────────────────

  router.get(
    '/minutes',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));
      let result;
      try {
        result = await pool.query(
          `SELECT id, call_sid, duration_seconds, billed_minutes, source, is_trial, billing_period_start, created_at
           FROM public.minutes_accounting
           WHERE tenant_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [tenantId, limit]
        );
      } catch {
        result = await pool.query(
          `SELECT id, call_sid, duration_seconds, billed_minutes, source, is_trial, billing_period_start
           FROM public.minutes_accounting
           WHERE tenant_id = $1
           ORDER BY billing_period_start DESC
           LIMIT $2`,
          [tenantId, limit]
        );
      }

      res.json({ success: true, data: result.rows });
    })
  );

  // ── Enforcement Check ────────────────────────────────────────────────

  router.get(
    '/enforcement',
    noConditionalCache,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const state = await billingService.getAccountState(tenantId);
      res.json({ success: true, data: state });
    })
  );

  router.get(
    '/account-state',
    noConditionalCache,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });
      const state = await billingService.getAccountState(tenantId);
      res.json({ success: true, data: state });
    })
  );

  router.post(
    '/checkout-session',
    validate(billingCheckoutBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      const { plan, email, successUrl, cancelUrl, interval, billingInterval } = req.body;

      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });
      if (!plan || !email) {
        return res.status(400).json({ success: false, error: 'Missing plan or email' });
      }
      if (!stripe) {
        throw new BillingNotConfiguredError();
      }

      const appUrl = getDashboardBaseUrl();
      const url = await billingService.createCheckoutSession(
        tenantId,
        plan,
        email,
        successUrl || `${appUrl}/dashboard/billing?checkout=success`,
        cancelUrl || `${appUrl}/dashboard/billing?checkout=cancel`,
        parseBillingInterval(billingInterval ?? interval ?? 'monthly')
      );
      res.json({ success: true, data: { url } });
    })
  );

  // ── Plan Config (for dashboard consumption) ─────────────────────────────

  router.get(
    '/plan-config',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant required' });

      const sub = await billingService.getActiveSubscription(tenantId);
      const plan = sub?.status === 'trialing' ? 'trial' : (sub?.plan || 'essential');
      const config = getPlanConfig(plan);
      const voiceRules = VOICE_RULES[plan as keyof typeof VOICE_RULES] || VOICE_RULES.essential;

      res.json({
        success: true,
        data: {
          plan,
          status: sub?.status || 'none',
          config,
          voiceRules,
          supportedLanguages: SUPPORTED_LANGUAGES,
          allowedLanguages: getAllowedLanguages(plan),
        },
      });
    })
  );

  // ── All Plan Definitions (public, for pricing page) ─────────────────────

  router.get(
    '/plan-definitions',
    asyncHandler(async (_req: any, res: any) => {
      res.json({
        success: true,
        data: {
          plans: PLAN_FEATURES,
          supportedLanguages: SUPPORTED_LANGUAGES,
          voiceRules: VOICE_RULES,
        },
      });
    })
  );

  router.get(
    '/enterprise-account',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      const { getEnterpriseAccount, listSlaCredits } = await import('../enterprise/enterprise-accounts.service.js');
      const account = await getEnterpriseAccount(tenantId);
      const credits = await listSlaCredits(tenantId);
      res.json({ success: true, data: { account, credits } });
    })
  );

  return router;
}

