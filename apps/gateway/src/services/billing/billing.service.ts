/**
 * Billing Service — Production-Ready
 * Handles Stripe integration, subscriptions, usage tracking, overage billing, and feature gating.
 */

import Stripe from 'stripe';

import { createRedisClient } from '../redis-connection.js';
import { logger } from '../logger.js';
import { pool } from '../db/pool.js';
import { BillingNotConfiguredError } from './billing-errors.js';
import {
  type BillingInterval,
  type PlanKey,
  getOveragePriceId,
  isStripeConfigured,
  parsePlanKey,
  resolveSubscriptionPriceId,
  validateStripeBillingConfig,
  warmStripePriceCache,
} from './stripe-catalog.js';

/** DB legacy constraint used British `cancelled`; Stripe and dashboard use `canceled`. */
function normalizeSubscriptionStatusForApi(status: string): Subscription['status'] {
  const s = String(status || 'active').toLowerCase();
  if (s === 'cancelled') return 'canceled';
  if (
    s === 'active' ||
    s === 'canceled' ||
    s === 'past_due' ||
    s === 'trialing' ||
    s === 'incomplete' ||
    s === 'unpaid' ||
    s === 'paused'
  ) {
    return s;
  }
  return 'active';
}

function subscriptionStatusForDb(status: string): string {
  const s = String(status || 'active').toLowerCase();
  if (s === 'cancelled' || s === 'canceled') return 'canceled';
  return s;
}

const redis = createRedisClient(undefined, { label: 'billing' });

const stripe = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_placeholder' 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-08-26.dahlia',
    })
  : null;

// Helper function to check if Stripe is available
function requireStripe(): Stripe {
  if (!stripe) {
    throw new BillingNotConfiguredError();
  }
  return stripe;
}

// ─── Plan Definitions (matching spec) ───────────────────────────────────────

export interface PlanFeature {
  callMinutes: number;
  estimatedCalls: number;
  callForwarding: boolean;
  coreAI: boolean;
  voicemailToText: boolean;
  appointmentBooking: 'basic' | 'native' | 'custom';
  browserDashboard: boolean;
  bilingual: 'en-es' | 'en-es-plus' | 'en-ar';
  languages: string[];
  emailSmsSummaries: boolean;
  crm: 'zapier_basic' | 'zapier_full' | 'zapier_full';
  calendar: 'basic' | 'native' | 'custom';
  customVoice: boolean;
  advancedAnalytics: boolean;
  apiAccess: boolean;
  dedicatedAccountManager: boolean;
  customOnboarding: boolean;
  hipaa: boolean;
  sla: boolean;
  additionalLanguages: number;
}

export interface PlanDefinition {
  name: string;
  key: string;
  price: number;
  overageRate: number;
  includedMinutes: number;
  estimatedCalls: number;
  features: PlanFeature;
  support: {
    liveChat: string;
    email: string;
  };
  trial: {
    days: number;
    requiresCard: boolean;
  };
  badge?: string;
}

const PLAN_RANK: Record<string, number> = { essential: 1, professional: 2 };

export const PLANS: Record<string, PlanDefinition> = {
  essential: {
    name: 'Essential',
    key: 'essential',
    price: 39,
    overageRate: 0.20,
    includedMinutes: 250,
    estimatedCalls: 100,
    features: {
      callMinutes: 250,
      estimatedCalls: 100,
      callForwarding: true,
      coreAI: true,
      voicemailToText: false,
      appointmentBooking: 'basic',
      browserDashboard: true,
      bilingual: 'en-ar',
      languages: ['en', 'ar'],
      emailSmsSummaries: true,
      crm: 'zapier_basic',
      calendar: 'basic',
      customVoice: false,
      advancedAnalytics: false,
      apiAccess: false,
      dedicatedAccountManager: false,
      customOnboarding: false,
      hipaa: false,
      sla: false,
      additionalLanguages: 0,
    },
    support: {
      liveChat: '7am–3pm ET',
      email: '24/7',
    },
    trial: {
      days: 14,
      requiresCard: false,
    },
  },
  professional: {
    name: 'Professional',
    key: 'professional',
    price: 149,
    overageRate: 0.15,
    includedMinutes: 750,
    estimatedCalls: 300,
    badge: 'Most Popular',
    features: {
      callMinutes: 750,
      estimatedCalls: 300,
      callForwarding: true,
      coreAI: true,
      voicemailToText: false,
      appointmentBooking: 'native',
      browserDashboard: true,
      bilingual: 'en-ar',
      languages: ['en', 'ar'],
      emailSmsSummaries: true,
      crm: 'zapier_full',
      calendar: 'native',
      customVoice: true,
      advancedAnalytics: true,
      apiAccess: true,
      dedicatedAccountManager: false,
      customOnboarding: false,
      hipaa: false,
      sla: false,
      additionalLanguages: 0,
    },
    support: {
      liveChat: '7am–3pm ET',
      email: '24/7',
    },
    trial: {
      days: 14,
      requiresCard: false,
    },
  },
};

export { validateStripeBillingConfig, warmStripePriceCache, isStripeConfigured };

async function subscriptionStripeItems(
  plan: string,
  interval: BillingInterval = 'monthly'
): Promise<Array<{ price: string }>> {
  const planKey = parsePlanKey(plan);
  if (!planKey) throw new Error(`Unknown plan: ${plan}`);
  const { priceId } = await resolveSubscriptionPriceId(planKey, interval);
  const items: Array<{ price: string }> = [{ price: priceId }];
  const overageId = getOveragePriceId(planKey);
  if (overageId) items.push({ price: overageId });
  return items;
}

function intervalFromStripePrice(price: Stripe.Price | undefined): BillingInterval {
  return price?.recurring?.interval === 'year' ? 'annual' : 'monthly';
}

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface Subscription {
  id: string;
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete' | 'unpaid' | 'paused';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageRecord {
  id: string;
  tenantId: string;
  subscriptionId: string;
  type: 'call_minutes' | 'sms_messages' | 'storage_gb';
  quantity: number;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
}

export interface OverageResult {
  overageMinutes: number;
  overageCost: number;
  plan: string;
  includedMinutes: number;
  usedMinutes: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  dueDate?: Date;
  paidAt?: Date;
  invoiceUrl?: string;
  createdAt: Date;
}

export interface UsageCheck {
  allowed: boolean;
  reason?: string;
  usedMinutes: number;
  limitMinutes: number;
  overageMinutes: number;
  graceRemaining: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class BillingService {
  private readonly usageDedupTTL = 86400; // 24h callSid dedup window
  private readonly graceBufferMinutes = 10; // allow 10 min overage before blocking

  // ── Customer ─────────────────────────────────────────────────────────────

  async createCustomer(tenantId: string, email: string, name: string): Promise<string> {
    const customer = await requireStripe().customers.create({
      email,
      name,
      metadata: { tenantId },
    });
    logger.info('Stripe customer created', { customerId: customer.id, tenantId });
    return customer.id;
  }

  // ── Subscription ─────────────────────────────────────────────────────────

  async createSubscription(
    tenantId: string,
    email: string,
    name: string,
    plan: string,
    paymentMethodId?: string
  ): Promise<Subscription> {
    if (!PLANS[plan]) throw new Error(`Unknown plan: ${plan}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Idempotency: reuse existing Stripe customer
      let customerId: string;
      const existingResult = await client.query(
        'SELECT stripe_customer_id FROM public.subscriptions WHERE tenant_id = $1 LIMIT 1',
        [tenantId]
      );

      if (existingResult.rows.length > 0) {
        customerId = existingResult.rows[0].stripe_customer_id;
      } else {
        customerId = await this.createCustomer(tenantId, email, name);
      }

      if (paymentMethodId) {
        await requireStripe().paymentMethods.attach(paymentMethodId, { customer: customerId });
        await requireStripe().customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      }

      // No trial_period_days here: the one 14-day free trial is already granted by
      // provisionFreeTrial() at signup. This path creates a real paid subscription
      // (matches createCheckoutSession's behavior, which is what the dashboard's
      // upgrade flow actually calls) -- it must not hand out a second trial or the
      // tenant's trial_started_at/trial_expires_at would go stale vs. this row.
      const planConfig = PLANS[plan];
      const subscription = await requireStripe().subscriptions.create({
        customer: customerId,
        items: await subscriptionStripeItems(plan, 'monthly'),
        metadata: { tenantId, plan, billingInterval: 'monthly' },
      });

      // trial_started_at/trial_expires_at intentionally left untouched on conflict:
      // this path never grants a trial, so an existing tenant's free-trial state
      // (from provisionFreeTrial) is preserved as-is rather than being overwritten.
      const result = await client.query(
        `INSERT INTO public.subscriptions
         (tenant_id, stripe_customer_id, stripe_subscription_id, plan, status,
          current_period_start, current_period_end, cancel_at_period_end,
          trial_started_at, trial_expires_at, included_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, NULL, NULL, $8)
         ON CONFLICT (tenant_id)
         DO UPDATE SET
           stripe_subscription_id = $3,
           plan = $4,
           status = $5,
           current_period_start = $6,
           current_period_end = $7,
           included_minutes = $8,
           updated_at = NOW()
         RETURNING id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status,
                   current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at`,
        [
          tenantId,
          customerId,
          subscription.id,
          plan,
          subscription.status,
          new Date((subscription as any).current_period_start * 1000),
          new Date((subscription as any).current_period_end * 1000),
          planConfig.includedMinutes,
        ]
      );

      await client.query('COMMIT');
      logger.info('Subscription created', { tenantId, plan, subscriptionId: subscription.id });
      return this.mapToSubscription(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating subscription', { tenantId, plan, error: String(error) });
      throw error;
    } finally {
      client.release();
    }
  }

  async getSubscription(tenantId: string): Promise<Subscription | null> {
    try {
      const result = await pool.query(
        `SELECT id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status,
                current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
         FROM public.subscriptions
         WHERE tenant_id = $1`,
        [tenantId]
      );
      if (result.rows.length === 0) return null;
      return this.mapToSubscription(result.rows[0]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/relation .* does not exist|42P01/i.test(msg)) {
        logger.warn('subscriptions table missing; treating as no subscription', { tenantId });
        return null;
      }
      if (/column .* does not exist|42703/i.test(msg)) {
        const fallback = await pool.query(
          `SELECT id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status,
                  current_period_start, current_period_end, created_at, updated_at
           FROM public.subscriptions
           WHERE tenant_id = $1`,
          [tenantId]
        );
        if (fallback.rows.length === 0) return null;
        const row = {
          ...fallback.rows[0],
          cancel_at_period_end: false,
        };
        return this.mapToSubscription(row);
      }
      throw err;
    }
  }

  async getActiveSubscription(tenantId: string): Promise<Subscription | null> {
    const sub = await this.getSubscription(tenantId);
    if (!sub) return null;
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) return null;
    return sub;
  }

  async hasSubscription(tenantId: string): Promise<boolean> {
    const sub = await this.getActiveSubscription(tenantId);
    return sub !== null;
  }

  // ── Plan Upgrade / Downgrade ─────────────────────────────────────────────

  async updateSubscriptionPlan(tenantId: string, newPlan: string): Promise<Subscription> {
    if (!PLANS[newPlan]) throw new Error(`Unknown plan: ${newPlan}`);

    const sub = await this.getSubscription(tenantId);
    if (!sub) throw new Error('Subscription not found');
    if (!sub.stripeSubscriptionId) throw new Error('No Stripe subscription linked');

    const currentRank = PLAN_RANK[sub.plan] ?? 0;
    const newRank = PLAN_RANK[newPlan] ?? 0;
    const isDowngrade = newRank < currentRank;

    const stripeSub = await requireStripe().subscriptions.retrieve(sub.stripeSubscriptionId);
    if (stripeSub.status === 'canceled') {
      throw new Error('Subscription ended — start a new checkout to subscribe again');
    }

    const planConfig = PLANS[newPlan];
    const planKey = parsePlanKey(newPlan);
    if (!planKey) throw new Error(`Unknown plan: ${newPlan}`);

    // For downgrades: bill any existing overage before switching
    if (isDowngrade) {
      const overage = await this.calculateOverage(tenantId);
      if (overage.overageMinutes > 0 && overage.overageCost > 0) {
        await this.billOverage(tenantId, overage);
        logger.info('Overage billed before downgrade', { tenantId, overageCost: overage.overageCost });
      }
    }

    const billingInterval = intervalFromStripePrice(stripeSub.items.data[0]?.price);
    const { priceId } = await resolveSubscriptionPriceId(planKey, billingInterval);
    const overagePriceId = getOveragePriceId(planKey);
    const updateItems: Stripe.SubscriptionUpdateParams.Item[] = [
      { id: stripeSub.items.data[0].id, price: priceId },
    ];
    if (overagePriceId && stripeSub.items.data[1]) {
      updateItems.push({ id: stripeSub.items.data[1].id, price: overagePriceId });
    }

    const updated = await requireStripe().subscriptions.update(sub.stripeSubscriptionId, {
      items: updateItems,
      proration_behavior: 'create_prorations',
      cancel_at_period_end: false,
      metadata: { tenantId, plan: newPlan, billingInterval },
    });

    // Carry forward usage to new period (reset for new plan)
    await this._resetUsageForPlanChange(tenantId);

    const result = await pool.query(
      `UPDATE public.subscriptions
       SET plan = $1, status = $2, updated_at = NOW(),
           current_period_start = $4, current_period_end = $5,
           included_minutes = $6
       WHERE tenant_id = $3
       RETURNING id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status,
                 current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at`,
      [
        newPlan,
        subscriptionStatusForDb(updated.status),
        tenantId,
        new Date((updated as any).current_period_start * 1000),
        new Date((updated as any).current_period_end * 1000),
        planConfig.includedMinutes,
      ]
    );

    logger.info('Subscription plan updated', { tenantId, fromPlan: sub.plan, toPlan: newPlan });
    this.notifyDashboardBilling(tenantId);
    return this.mapToSubscription(result.rows[0]);
  }

  private async _resetUsageForPlanChange(tenantId: string): Promise<void> {
    // Archive old usage records under a period boundary marker
    await pool.query(
      `UPDATE public.usage_records
       SET period_end = NOW()
       WHERE tenant_id = $1 AND period_end IS NULL`,
      [tenantId]
    );
  }

  // ── Cancel ───────────────────────────────────────────────────────────────

  async cancelSubscription(tenantId: string, immediately: boolean = false): Promise<Subscription> {
    const sub = await this.getSubscription(tenantId);
    if (!sub) throw new Error('Subscription not found');

    if (!sub.stripeSubscriptionId) {
      await pool.query(
        `UPDATE public.subscriptions SET status = 'canceled', cancel_at_period_end = false, updated_at = NOW() WHERE tenant_id = $1`,
        [tenantId]
      );
    } else if (immediately) {
      await requireStripe().subscriptions.cancel(sub.stripeSubscriptionId);
      await pool.query(
        `UPDATE public.subscriptions SET status = 'canceled', cancel_at_period_end = false, updated_at = NOW() WHERE tenant_id = $1`,
        [tenantId]
      );
    } else {
      await requireStripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
      await pool.query(
        `UPDATE public.subscriptions SET cancel_at_period_end = true, updated_at = NOW() WHERE tenant_id = $1`,
        [tenantId]
      );
    }

    logger.info('Subscription canceled', { tenantId, immediately });
    this.notifyDashboardBilling(tenantId);
    return (await this.getSubscription(tenantId))!;
  }

  // ── Usage Tracking (unified, deduplicated, validated) ────────────────────

  /**
   * Per-call usage row. Prod DBs may still require legacy `minutes` (numeric) alongside billed_minutes.
   */
  private async insertMinutesAccountingRow(input: {
    tenantId: string;
    subscriptionId: string | null;
    callSid: string;
    durationSeconds: number;
    billedMinutes: number;
    isTrialing: boolean;
    billingPeriodStart: string;
    billingPeriodEnd: string;
  }): Promise<void> {
    const {
      tenantId,
      subscriptionId,
      callSid,
      durationSeconds,
      billedMinutes,
      isTrialing,
      billingPeriodStart,
      billingPeriodEnd,
    } = input;

    const variants: Array<{ sql: string; values: unknown[] }> = [
      {
        sql: `INSERT INTO public.minutes_accounting
              (tenant_id, subscription_id, call_sid, duration_seconds, billed_minutes, minutes, source, is_trial, billing_period_start, billing_period_end)
              VALUES ($1, $2, $3, $4, $5, $6::numeric, 'voice', $7, $8, $9)
              ON CONFLICT (tenant_id, call_sid, source) DO NOTHING`,
        values: [
          tenantId,
          subscriptionId,
          callSid,
          durationSeconds,
          billedMinutes,
          billedMinutes,
          isTrialing,
          billingPeriodStart,
          billingPeriodEnd,
        ],
      },
      {
        sql: `INSERT INTO public.minutes_accounting
              (tenant_id, call_sid, duration_seconds, billed_minutes, minutes, source, is_trial, billing_period_start, billing_period_end)
              VALUES ($1, $2, $3, $4, $5, $6::numeric, 'voice', $7, $8, $9)
              ON CONFLICT (tenant_id, call_sid, source) DO NOTHING`,
        values: [
          tenantId,
          callSid,
          durationSeconds,
          billedMinutes,
          billedMinutes,
          isTrialing,
          billingPeriodStart,
          billingPeriodEnd,
        ],
      },
      {
        sql: `INSERT INTO public.minutes_accounting
              (tenant_id, subscription_id, call_sid, duration_seconds, billed_minutes, source, is_trial, billing_period_start, billing_period_end)
              VALUES ($1, $2, $3, $4, $5, 'voice', $6, $7, $8)
              ON CONFLICT (tenant_id, call_sid, source) DO NOTHING`,
        values: [
          tenantId,
          subscriptionId,
          callSid,
          durationSeconds,
          billedMinutes,
          isTrialing,
          billingPeriodStart,
          billingPeriodEnd,
        ],
      },
      {
        sql: `INSERT INTO public.minutes_accounting
              (tenant_id, call_sid, duration_seconds, billed_minutes, source, is_trial, billing_period_start, billing_period_end)
              VALUES ($1, $2, $3, $4, 'voice', $5, $6, $7)
              ON CONFLICT (tenant_id, call_sid, source) DO NOTHING`,
        values: [
          tenantId,
          callSid,
          durationSeconds,
          billedMinutes,
          isTrialing,
          billingPeriodStart,
          billingPeriodEnd,
        ],
      },
    ];

    let lastError: unknown;
    for (const variant of variants) {
      try {
        await pool.query(variant.sql, variant.values);
        return;
      } catch (err) {
        lastError = err;
        const msg = String(err);
        const retryable =
          msg.includes('does not exist') ||
          msg.includes('subscription_id') ||
          msg.includes('null value in column "minutes"') ||
          (msg.includes('minutes') && msg.includes('not-null'));
        if (retryable) continue;
        throw err;
      }
    }

    logger.warn('minutes_accounting insert failed after all variants', {
      tenantId,
      callSid,
      error: String(lastError),
    });
  }

  /**
   * Track call minutes — the primary path used by the voice pipeline.
   * Uses Redis dedup to prevent double-counting the same callSid.
   * Writes to both Redis (fast) and Postgres (billing source of truth).
   */
  async trackCallMinutes(tenantId: string, callSid: string, durationMs: number): Promise<void> {
    if (durationMs <= 0) return;

    try {
      const spamRow = await pool.query(
        `SELECT is_spam FROM public.calls WHERE tenant_id = $1 AND call_sid = $2 LIMIT 1`,
        [tenantId, callSid]
      );
      if (spamRow.rows[0]?.is_spam === true) {
        logger.info('Skipping billing for spam call', { tenantId, callSid });
        return;
      }
    } catch {
      /* calls table may lack is_spam on older DBs */
    }

    // Dedup by callSid
    const dedupKey = `voice:usage:seen:${callSid}`;
    const acquired = await redis.set(dedupKey, '1', 'EX', this.usageDedupTTL, 'NX');
    if (!acquired) {
      logger.debug('Duplicate usage tracking ignored', { callSid, tenantId });
      return;
    }

    // Round UP to nearest minute — never undercharge
    const minutes = Math.ceil(durationMs / 60000);

    // Fast Redis counter (for real-time blocking checks)
    const today = new Date().toISOString().slice(0, 10);
    const pipeline = redis.pipeline();
    pipeline.incrby(`voice:usage:minutes:${tenantId}:${today}`, minutes);
    pipeline.expire(`voice:usage:minutes:${tenantId}:${today}`, 86400 * 35); // 35-day TTL covers any billing period
    await pipeline.exec();

    // Authoritative Postgres record
    try {
      const sub = await this.getSubscription(tenantId);
      const periodStart = sub ? sub.currentPeriodStart : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const periodEnd = sub ? sub.currentPeriodEnd : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

      if (sub?.id) {
        // With subscription: upsert using named unique constraint
        await pool.query(
          `INSERT INTO public.usage_records (tenant_id, subscription_id, type, quantity, period_start, period_end)
           VALUES ($1, $2, 'call_minutes', $3, $4, $5)
           ON CONFLICT ON CONSTRAINT usage_records_subscription_unique
           DO UPDATE SET quantity = usage_records.quantity + $3, updated_at = NOW()`,
          [tenantId, sub.id, minutes, periodStart, periodEnd]
        );
      } else {
        // No subscription: simple insert (no conflict; duplicates prevented by Redis callSid dedup)
        await pool.query(
          `INSERT INTO public.usage_records (tenant_id, type, quantity, period_start, period_end)
           VALUES ($1, 'call_minutes', $2, $3, $4)`,
          [tenantId, minutes, periodStart, periodEnd]
        );
      }

      // ── Granular minute accounting ──────────────────────────────────
      const isTrialing = sub?.status === 'trialing';
      const billingPeriodStart = sub?.currentPeriodStart?.toISOString().slice(0, 10)
        || new Date().toISOString().slice(0, 10);
      const billingPeriodEnd = sub?.currentPeriodEnd?.toISOString().slice(0, 10)
        || new Date().toISOString().slice(0, 10);

      const durationSeconds = Math.max(1, Math.ceil(durationMs / 1000));
      await this.insertMinutesAccountingRow({
        tenantId,
        subscriptionId: sub?.id || null,
        callSid,
        durationSeconds,
        billedMinutes: minutes,
        isTrialing,
        billingPeriodStart,
        billingPeriodEnd,
      });

      // Update trial minutes counter
      if (isTrialing) {
        await pool.query(
          `UPDATE public.subscriptions
           SET trial_minutes_used = trial_minutes_used + $1
           WHERE tenant_id = $2 AND status = 'trialing'`,
          [minutes, tenantId]
        );
        const { trialManager } = await import('./trial.service.js');
        await trialManager.afterUsageRecorded(tenantId).catch((err) => {
          logger.warn('Trial post-usage hooks failed', { tenantId, error: String(err) });
        });
      }
    } catch (error) {
      // Log but don't fail the call — Postgres is the backup; Redis has the count
      logger.error('Failed to write usage to Postgres', { tenantId, callSid, error: String(error) });
    }
  }

  /**
   * Legacy trackUsage — validates input and routes through the unified path.
   */
  async trackUsage(
    tenantId: string,
    type: UsageRecord['type'],
    quantity: number
  ): Promise<UsageRecord> {
    if (quantity < 0 || !Number.isFinite(quantity)) {
      throw new Error('Usage quantity must be a non-negative finite number');
    }
    if (quantity === 0) {
      throw new Error('Usage quantity must be greater than zero');
    }

    const sub = await this.getSubscription(tenantId);
    if (!sub) throw new Error('Subscription not found');

    const periodStart = sub.currentPeriodStart;
    const periodEnd = sub.currentPeriodEnd;

    const result = await pool.query(
      `INSERT INTO public.usage_records (tenant_id, subscription_id, type, quantity, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT usage_records_subscription_unique
       DO UPDATE SET quantity = usage_records.quantity + $4, updated_at = NOW()
       RETURNING id, tenant_id, subscription_id, type, quantity, period_start as "periodStart", period_end as "periodEnd", created_at`,
      [tenantId, sub.id, type, quantity, periodStart, periodEnd]
    );

    return this.mapToUsageRecord(result.rows[0]);
  }

  // ── Usage Queries ────────────────────────────────────────────────────────

  async getCurrentUsage(tenantId: string): Promise<{
    callMinutes: number;
    smsMessages: number;
    storageGb: number;
  }> {
    const sub = await this.getSubscription(tenantId);
    if (!sub) {
      return { callMinutes: 0, smsMessages: 0, storageGb: 0 };
    }

    let result;
    try {
      result = await pool.query(
        `SELECT type, SUM(quantity) as total
         FROM public.usage_records
         WHERE tenant_id = $1 
           AND subscription_id = $2
           AND type IN ('call_minutes', 'sms_messages', 'storage_gb')
         GROUP BY type`,
        [tenantId, sub.id]
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/relation .* does not exist|42P01|column .* does not exist|42703/i.test(msg)) {
        logger.warn('usage_records schema missing; returning zero usage', { tenantId, error: msg });
        return { callMinutes: 0, smsMessages: 0, storageGb: 0 };
      }
      throw err;
    }

    const usage = { callMinutes: 0, smsMessages: 0, storageGb: 0 };
    for (const row of result.rows) {
      const val = parseFloat(row.total);
      if (row.type === 'call_minutes') usage.callMinutes = Math.round(val);
      else if (row.type === 'sms_messages') usage.smsMessages = Math.round(val);
      else if (row.type === 'storage_gb') usage.storageGb = Math.round(val * 100) / 100;
    }

    return usage;
  }

  /**
   * Fast usage check from Redis cache — used in the hot call path.
   */
  async getCachedUsageMinutes(tenantId: string): Promise<number> {
    const pipeline = redis.pipeline();
    // Sum last 31 days to cover any billing period
    for (let i = 0; i < 31; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      pipeline.get(`voice:usage:minutes:${tenantId}:${d.toISOString().slice(0, 10)}`);
    }
    const results = await pipeline.exec();
    let total = 0;
    if (results) {
      for (const [, value] of results) {
        if (value) total += parseInt(value as string, 10) || 0;
      }
    }
    return total;
  }

  // ── Overage Calculation & Billing ────────────────────────────────────────

  async calculateOverage(tenantId: string): Promise<OverageResult> {
    const sub = await this.getSubscription(tenantId);
    if (!sub || !['active', 'trialing', 'past_due'].includes(sub.status)) {
      return { overageMinutes: 0, overageCost: 0, plan: 'none', includedMinutes: 0, usedMinutes: 0 };
    }

    const planConfig = PLANS[sub.plan];
    if (!planConfig) {
      return { overageMinutes: 0, overageCost: 0, plan: sub.plan, includedMinutes: 0, usedMinutes: 0 };
    }

    const usage = await this.getCurrentUsage(tenantId);
    const overageMinutes = Math.max(0, usage.callMinutes - planConfig.features.callMinutes);
    // Round UP — never undercharge
    const roundedOverage = Math.ceil(overageMinutes);
    const overageCost = Math.round(roundedOverage * planConfig.overageRate * 100) / 100;

    return {
      overageMinutes: roundedOverage,
      overageCost,
      plan: sub.plan,
      includedMinutes: planConfig.features.callMinutes,
      usedMinutes: usage.callMinutes,
    };
  }

  /**
   * Bill overage by creating a Stripe invoice item.
   */
  async billOverage(tenantId: string, overage: OverageResult): Promise<string | null> {
    if (overage.overageCost <= 0) return null;

    const sub = await this.getSubscription(tenantId);
    if (!sub) return null;

    try {
      // Report usage to Stripe metered billing item
      const stripeSub = await requireStripe().subscriptions.retrieve(sub.stripeSubscriptionId);
      const planKey = parsePlanKey(sub.plan);
      const configuredOverageId = planKey ? getOveragePriceId(planKey) : null;
      const overageItemId = configuredOverageId
        ? stripeSub.items.data.find((item) => item.price.id === configuredOverageId)?.id
        : undefined;

      if (overageItemId) {
        await (requireStripe() as any).subscriptionItems.createUsageRecord(overageItemId, {
          quantity: overage.overageMinutes,
          action: 'set',
        });
      } else {
        // Fallback: create a one-time invoice item
        await requireStripe().invoiceItems.create({
          customer: sub.stripeCustomerId,
          amount: Math.round(overage.overageCost * 100),
          currency: 'usd',
          description: `Overage charge: ${overage.overageMinutes} minutes at $${PLANS[sub.plan].overageRate}/min`,
          metadata: { tenantId, type: 'overage' },
        });
      }

      logger.info('Overage billed', { tenantId, overageMinutes: overage.overageMinutes, overageCost: overage.overageCost });
      return sub.stripeCustomerId;
    } catch (error) {
      logger.error('Failed to bill overage', { tenantId, error: String(error) });
      throw error;
    }
  }

  // ── Usage Check (for call blocking) ──────────────────────────────────────

  async checkUsageAllowance(tenantId: string, preloadedSub?: Subscription | null): Promise<UsageCheck> {
    const sub = preloadedSub !== undefined ? preloadedSub : await this.getActiveSubscription(tenantId);
    if (!sub) {
      return { allowed: false, reason: 'No active subscription', usedMinutes: 0, limitMinutes: 0, overageMinutes: 0, graceRemaining: 0 };
    }

    // ── Trial enforcement ─────────────────────────────────────────────
    if (sub.status === 'trialing') {
      const { trialManager } = await import('./trial.service.js');
      const trialBlock = await trialManager.isTrialBlocked(tenantId);
      if (trialBlock.blocked) {
        return {
          allowed: false,
          reason: trialBlock.reason || 'Trial has ended',
          usedMinutes: 0,
          limitMinutes: 60,
          overageMinutes: 0,
          graceRemaining: 0,
        };
      }

      // Trial allowed — return with trial limits
      const trialStatus = await trialManager.getTrialStatus(tenantId);
      return {
        allowed: true,
        usedMinutes: trialStatus.trialMinutesUsed,
        limitMinutes: trialStatus.trialMinutesLimit,
        overageMinutes: Math.max(0, trialStatus.trialMinutesUsed - trialStatus.trialMinutesLimit),
        graceRemaining: Math.max(0, trialStatus.trialMinutesLimit - trialStatus.trialMinutesUsed),
      };
    }

    const planConfig = PLANS[sub.plan];
    if (!planConfig) {
      // A subscription row referencing a plan key that no longer exists (e.g. a
      // retired tier) blocks every call with no other trace in the logs —
      // surface it so it can be caught and migrated instead of silently blocking.
      logger.warn('BILLING_UNKNOWN_PLAN', { tenantId, plan: sub.plan });
      return { allowed: false, reason: 'Unknown plan', usedMinutes: 0, limitMinutes: 0, overageMinutes: 0, graceRemaining: 0 };
    }

    // Fast path: use Redis cached usage
    const usedMinutes = await this.getCachedUsageMinutes(tenantId);
    const limitMinutes = planConfig.features.callMinutes;
    const rawOverage = usedMinutes - limitMinutes;
    const overageMinutes = Math.max(0, rawOverage);
    const graceRemaining = Math.max(0, this.graceBufferMinutes - overageMinutes);

    // Allow if within grace buffer
    if (overageMinutes <= this.graceBufferMinutes) {
      return { allowed: true, usedMinutes, limitMinutes, overageMinutes, graceRemaining };
    }

    // Check if tenant has a valid payment method for overage billing
    const customer = await requireStripe().customers.retrieve(sub.stripeCustomerId);
    const hasPaymentMethod = !!(customer as any).invoice_settings?.default_payment_method
      || (customer as any).default_source;

    if (!hasPaymentMethod) {
      return {
        allowed: false,
        reason: `Usage limit reached (${usedMinutes}/${limitMinutes} min). Add a payment method to continue.`,
        usedMinutes,
        limitMinutes,
        overageMinutes,
        graceRemaining: 0,
      };
    }

    // Has payment method — allow with overage
    // Bill overage if we haven't already this cycle
    const existingOverage = await this._hasPendingOverage(tenantId);
    if (!existingOverage) {
      const overageResult = await this.calculateOverage(tenantId);
      if (overageResult.overageCost > 0) {
        await this.billOverage(tenantId, overageResult);
      }
    }

    return { allowed: true, usedMinutes, limitMinutes, overageMinutes, graceRemaining };
  }

  private async _hasPendingOverage(tenantId: string): Promise<boolean> {
    const key = `voice:overage:pending:${tenantId}`;
    const exists = await redis.get(key);
    if (exists) return true;
    // Mark as pending for 1 hour to avoid repeated billing
    await redis.set(key, '1', 'EX', 3600);
    return false;
  }

  // ── Feature Gating ───────────────────────────────────────────────────────

  async canUseFeature(tenantId: string, feature: keyof PlanFeature): Promise<boolean> {
    const sub = await this.getActiveSubscription(tenantId);
    if (!sub) return false;
    const planConfig = PLANS[sub.plan];
    if (!planConfig) return false;
    const value = planConfig.features[feature];
    if (typeof value === 'number') return value > 0;
    return Boolean(value);
  }

  async getPlanDetails(tenantId: string): Promise<PlanDefinition | null> {
    const sub = await this.getActiveSubscription(tenantId);
    if (!sub) return null;
    return PLANS[sub.plan] || null;
  }

  async getPlanRank(plan: string): Promise<number> {
    return PLAN_RANK[plan] ?? 0;
  }

  async isEnterprise(_tenantId: string): Promise<boolean> {
    return false;
  }

  async getFeatureSummary(tenantId: string): Promise<{
    plan: string;
    callMinutes: { used: number; limit: number; overageRate: number };
    crm: string;
    calendar: string;
    customVoice: boolean;
    advancedAnalytics: boolean;
    hipaa: boolean;
    sla: boolean;
  }> {
    const sub = await this.getActiveSubscription(tenantId);
    if (!sub) {
      return {
        plan: 'none',
        callMinutes: { used: 0, limit: 0, overageRate: 0 },
        crm: 'none',
        calendar: 'none',
        customVoice: false,
        advancedAnalytics: false,
        hipaa: false,
        sla: false,
      };
    }
    const planConfig = PLANS[sub.plan];
    if (!planConfig) {
      return {
        plan: sub.plan,
        callMinutes: { used: 0, limit: 0, overageRate: 0 },
        crm: 'none',
        calendar: 'none',
        customVoice: false,
        advancedAnalytics: false,
        hipaa: false,
        sla: false,
      };
    }

    const usage = await this.getCurrentUsage(tenantId);

    return {
      plan: sub.plan,
      callMinutes: {
        used: usage.callMinutes,
        limit: planConfig.features.callMinutes,
        overageRate: planConfig.overageRate,
      },
      crm: planConfig.features.crm,
      calendar: planConfig.features.appointmentBooking,
      customVoice: planConfig.features.customVoice,
      advancedAnalytics: planConfig.features.advancedAnalytics,
      hipaa: planConfig.features.hipaa,
      sla: planConfig.features.sla,
    };
  }

  // ── Invoices ─────────────────────────────────────────────────────────────

  async getInvoices(tenantId: string, limit: number = 12): Promise<Invoice[]> {
    try {
      const result = await pool.query(
        `SELECT id, tenant_id, stripe_invoice_id,
                COALESCE(amount_paid, amount_due, 0) AS amount, currency, status,
                due_date, paid_at, invoice_pdf_url AS invoice_url, created_at
         FROM public.invoices
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [tenantId, limit]
      );
      return result.rows.map(this.mapToInvoice);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/relation .* does not exist|42P01|column .* does not exist|42703/i.test(msg)) {
        logger.warn('invoices schema missing; returning empty invoices', { tenantId, error: msg });
        return [];
      }
      throw err;
    }
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────

  async handleWebhook(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.trial_will_end':
        await this.handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
        await this.handleInvoiceUpdate(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_action_required':
        logger.warn('Payment action required for invoice', {
          invoiceId: (event.data.object as Stripe.Invoice).id,
        });
        break;
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenantId;
        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        if (tenantId && subId) {
          const stripeSub = await requireStripe().subscriptions.retrieve(subId);
          await this.syncSubscriptionFromStripe(stripeSub, tenantId);
        } else if (tenantId) {
          this.notifyDashboardBilling(tenantId);
        }
        break;
      }
      default:
        logger.debug('Unhandled webhook event', { type: event.type });
    }
  }

  private notifyDashboardBilling(tenantId: string): void {
    void import('../dashboard/dashboard-events.js').then(({ publishDashboardPushType }) => {
      publishDashboardPushType(tenantId, 'billing.updated');
    });
  }

  private async handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = (subscription as any).metadata?.tenantId;
    if (!tenantId) return;

    logger.info('Trial will end soon', { tenantId, subscriptionId: subscription.id });

    // Create a billing warning for trial ending
    const { trialManager } = await import('./trial.service.js');
    await trialManager['createWarning'](tenantId, 'subscription_expiring',
      'Your free trial will end soon. Add a payment method to keep your service active.',
      { subscriptionId: subscription.id, trialEnd: subscription.trial_end }
    );
  }

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = (subscription as any).metadata?.tenantId;
    if (!tenantId) return;

    await this.syncSubscriptionFromStripe(subscription, tenantId);
    logger.info('Subscription created via webhook', { tenantId, subscriptionId: subscription.id });
  }

  private async syncSubscriptionFromStripe(
    subscription: Stripe.Subscription,
    tenantId: string
  ): Promise<void> {
    const planFromStripe = (subscription as any).metadata?.plan;
    const isTrialing = subscription.status === 'trialing';
    const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
    const dbStatus = subscriptionStatusForDb(subscription.status);

    const updateFields: string[] = [
      'stripe_subscription_id = $1',
      'status = $2',
      'current_period_start = $3',
      'current_period_end = $4',
      'cancel_at_period_end = $5',
      'updated_at = NOW()',
    ];
    const values: any[] = [
      subscription.id,
      dbStatus,
      new Date((subscription as any).current_period_start * 1000),
      new Date((subscription as any).current_period_end * 1000),
      subscription.cancel_at_period_end,
    ];

    if (isTrialing && trialEnd) {
      updateFields.push(`trial_expires_at = $${values.length + 1}`);
      values.push(trialEnd);
      updateFields.push(`trial_started_at = COALESCE(trial_started_at, $${values.length + 1})`);
      values.push(new Date((subscription as any).current_period_start * 1000));
    } else if (trialEnd && !isTrialing) {
      updateFields.push(`trial_expires_at = $${values.length + 1}`);
      values.push(trialEnd);
    }

    if (planFromStripe) {
      updateFields.push(`plan = $${values.length + 1}`);
      values.push(planFromStripe);
      const planConfig = PLANS[planFromStripe];
      if (planConfig) {
        updateFields.push(`included_minutes = $${values.length + 1}`);
        values.push(planConfig.includedMinutes);
      }
    }

    values.push(tenantId);
    const byTenant = await pool.query(
      `UPDATE public.subscriptions SET ${updateFields.join(', ')} WHERE tenant_id = $${values.length}`,
      values
    );

    if (byTenant.rowCount === 0) {
      const plan = planFromStripe && PLANS[planFromStripe] ? planFromStripe : 'essential';
      const includedMinutes = PLANS[plan]?.includedMinutes ?? 250;
      await pool.query(
        `INSERT INTO public.subscriptions (
           tenant_id, stripe_subscription_id, plan, status,
           current_period_start, current_period_end, cancel_at_period_end, included_minutes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id) DO UPDATE SET
           stripe_subscription_id = EXCLUDED.stripe_subscription_id,
           plan = EXCLUDED.plan,
           status = EXCLUDED.status,
           current_period_start = EXCLUDED.current_period_start,
           current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end,
           included_minutes = EXCLUDED.included_minutes,
           updated_at = NOW()`,
        [
          tenantId,
          subscription.id,
          plan,
          dbStatus,
          new Date((subscription as any).current_period_start * 1000),
          new Date((subscription as any).current_period_end * 1000),
          subscription.cancel_at_period_end,
          includedMinutes,
        ]
      );
    }

    await redis.del(`voice:overage:pending:${tenantId}`);

    if (subscription.status === 'active') {
      await pool.query(
        `UPDATE public.voice_tenants SET billing_block_reason = NULL, updated_at = NOW() WHERE id = $1`,
        [tenantId]
      );
    }

    this.notifyDashboardBilling(tenantId);
  }

  private async handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = (subscription as any).metadata?.tenantId;
    if (!tenantId) return;

    await this.syncSubscriptionFromStripe(subscription, tenantId);
    logger.info('Subscription updated from webhook', {
      tenantId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  }

  private async handleInvoiceUpdate(invoice: Stripe.Invoice): Promise<void> {
    let tenantId = (invoice as any).metadata?.tenantId;

    if (!tenantId) {
      const subId = typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;

      if (subId) {
        const sub = await requireStripe().subscriptions.retrieve(subId);
        tenantId = (sub as any).metadata?.tenantId;
      }
    }

    if (!tenantId) return;

    await pool.query(
      `INSERT INTO public.invoices
       (tenant_id, stripe_invoice_id, amount_due, amount_paid, currency, status, due_date, paid_at, invoice_pdf_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (stripe_invoice_id)
       DO UPDATE SET status = $6, paid_at = $8, amount_paid = $4`,
      [
        tenantId,
        invoice.id,
        (invoice.amount_due ?? 0) / 100,
        (invoice.amount_paid ?? 0) / 100,
        invoice.currency,
        invoice.status,
        invoice.due_date ? new Date(invoice.due_date * 1000) : null,
        invoice.status === 'paid' ? new Date() : null,
        (invoice as any).hosted_invoice_url ?? null,
      ]
    );

    if (invoice.status === 'open' && (invoice as any).attempt_count > 0) {
      await pool.query(
        `UPDATE public.subscriptions SET status = 'past_due', updated_at = NOW() WHERE tenant_id = $1`,
        [tenantId]
      );
      await pool.query(
        `UPDATE public.voice_tenants SET billing_block_reason = 'payment_required', updated_at = NOW() WHERE id = $1`,
        [tenantId]
      );
      const { trialManager } = await import('./trial.service.js');
      await trialManager.createWarning(
        tenantId,
        'payment_failed',
        'Your last payment failed. Update your billing details to restore full service.',
        { invoiceId: invoice.id }
      );
      const { invalidateAccountAccessCache } = await import('./account-access.service.js');
      invalidateAccountAccessCache(tenantId);
    }

    if (invoice.status === 'paid') {
      await pool.query(
        `UPDATE public.voice_tenants SET billing_block_reason = NULL, updated_at = NOW() WHERE id = $1`,
        [tenantId]
      );
      const { invalidateAccountAccessCache } = await import('./account-access.service.js');
      invalidateAccountAccessCache(tenantId);
    }

    logger.info('Invoice updated from webhook', { tenantId, invoiceId: invoice.id, status: invoice.status });
    this.notifyDashboardBilling(tenantId);
  }

  // ── Plan Details ─────────────────────────────────────────────────────────

  getPlanByKey(plan: string): PlanDefinition | undefined {
    return PLANS[plan];
  }

  getAllPlans(): Record<string, PlanDefinition> {
    return PLANS;
  }

  /** Public catalog — no Stripe secrets; live amounts when Stripe is configured. */
  async getPublicPlans(): Promise<Record<string, unknown>> {
    const catalog: Record<string, unknown> = {};
    const checkoutReady = isStripeConfigured();

    for (const [key, plan] of Object.entries(PLANS)) {
      const planKey = key as PlanKey;
      let monthlyAmount = plan.price;
      let annualAmount: number | null = null;
      let pricesResolved = false;

      if (checkoutReady) {
        try {
          const monthly = await resolveSubscriptionPriceId(planKey, 'monthly');
          if (monthly.unitAmountCents != null) monthlyAmount = monthly.unitAmountCents / 100;
          const annual = await resolveSubscriptionPriceId(planKey, 'annual');
          if (annual.unitAmountCents != null) annualAmount = annual.unitAmountCents / 100;
          pricesResolved = true;
        } catch (err) {
          logger.warn('PUBLIC_PLAN_PRICE_RESOLVE_FAILED', {
            plan: planKey,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      catalog[key] = {
        name: plan.name,
        key: plan.key,
        price: monthlyAmount,
        pricing: {
          monthly: { amount: monthlyAmount, currency: 'usd', interval: 'month' as const },
          annual: {
            amount: annualAmount ?? Math.round(monthlyAmount * 10),
            currency: 'usd',
            interval: 'year' as const,
            estimated: annualAmount == null,
          },
        },
        overageRate: plan.overageRate,
        includedMinutes: plan.includedMinutes,
        estimatedCalls: plan.estimatedCalls,
        features: plan.features,
        support: plan.support,
        trial: plan.trial,
        badge: plan.badge,
        checkoutReady: checkoutReady && pricesResolved,
      };
    }

    return catalog;
  }

  // ── Mappers ──────────────────────────────────────────────────────────────

  private mapToSubscription(row: any): Subscription {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      plan: row.plan,
      status: normalizeSubscriptionStatusForApi(row.status),
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapToUsageRecord(row: any): UsageRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      subscriptionId: row.subscription_id,
      type: row.type,
      quantity: row.quantity,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      createdAt: row.created_at,
    };
  }

  private mapToInvoice(row: any): Invoice {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      stripeInvoiceId: row.stripe_invoice_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      dueDate: row.due_date,
      paidAt: row.paid_at,
      invoiceUrl: row.invoice_url,
      createdAt: row.created_at,
    };
  }

  // ── Free trial (no Stripe required at signup) ─────────────────────────────

  /**
   * 14-day trial with 60 cumulative minutes. Unlocks professional-tier features (plan-config trial).
   */
  async provisionFreeTrial(tenantId: string): Promise<void> {
    const existing = await this.getSubscription(tenantId);
    if (existing) {
      if (existing.status === 'trialing' || existing.status === 'active' || existing.status === 'paused') return;
    }

    const now = new Date();
    const expires = new Date(now.getTime() + Number(process.env.TRIAL_DAYS || 14) * 86400000);

    await pool.query(
      `INSERT INTO public.subscriptions (
         tenant_id, plan, status,
         trial_started_at, trial_expires_at, trial_minutes_used,
         included_minutes, current_period_start, current_period_end
       )
       VALUES ($1, 'professional', 'trialing', $2, $3, 0, 60, $2, $3)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId, now, expires]
    );

    await pool.query(
      `UPDATE public.voice_tenants
       SET billing_block_reason = NULL, updated_at = NOW()
       WHERE id = $1`,
      [tenantId]
    );

    logger.info('Free trial provisioned', { tenantId, trialExpiresAt: expires.toISOString() });
  }

  private async getDailyUsageRows(
    tenantId: string
  ): Promise<{ rows: { day: Date | string; minutes: string | number }[] }> {
    const queries = [
      `SELECT billing_period_start as day, COALESCE(SUM(billed_minutes), 0)::int as minutes
       FROM public.minutes_accounting
       WHERE tenant_id = $1
         AND billing_period_start >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY billing_period_start
       ORDER BY day DESC
       LIMIT 30`,
      `SELECT DATE(created_at) as day, COALESCE(SUM(billed_minutes), 0)::int as minutes
       FROM public.minutes_accounting
       WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY day DESC
       LIMIT 30`,
    ];
    for (const sql of queries) {
      try {
        return await pool.query(sql, [tenantId]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('does not exist')) continue;
        throw err;
      }
    }
    return { rows: [] };
  }

  async getAccountState(tenantId: string): Promise<Record<string, unknown>> {
    try {
      const { trialManager } = await import('./trial.service.js');

      // Run every independent read in parallel instead of 8 sequential round-trips --
      // shrinks both request latency and the window in which a single transient DB
      // blip can throw. sub and trialBlock were each re-fetching data another call
      // in this batch already computed (getActiveSubscription re-ran getSubscription;
      // isTrialBlocked re-ran getTrialStatus) -- both are now derived locally instead.
      const [trial, sub, warnings, usage, overage, dailyUsage] = await Promise.all([
        trialManager.getTrialStatus(tenantId),
        this.getSubscription(tenantId),
        trialManager.getWarnings(tenantId, true),
        this.getCurrentUsage(tenantId),
        this.calculateOverage(tenantId),
        this.getDailyUsageRows(tenantId),
      ]);

      const trialBlock = trialManager.evaluateTrialBlock(trial);
      const activeSub =
        sub && ['active', 'trialing', 'past_due'].includes(sub.status) ? sub : null;

      let mode: 'trialing' | 'active' | 'locked' | 'none' = 'none';
      if (trial.isLocked || sub?.status === 'paused') mode = 'locked';
      else if (trial.isTrialing) mode = 'trialing';
      else if (sub && ['active', 'past_due'].includes(sub.status)) mode = 'active';
      else if (!sub) mode = 'none';

      return {
        mode,
        canCall: !trialBlock.blocked && (!!activeSub || trial.isTrialing),
        canEdit: mode !== 'locked',
        canUseIntegrations: mode !== 'locked',
        dashboardReadOnly: mode === 'locked',
        trial,
        subscription: sub,
        warnings,
        usage: {
          ...usage,
          callMinutes: trial.isTrialing ? trial.trialMinutesUsed : usage.callMinutes,
          limitMinutes: trial.isTrialing
            ? trial.trialMinutesLimit
            : (PLANS[sub?.plan || '']?.includedMinutes ?? 0),
        },
        overage,
        dailyUsage: dailyUsage.rows,
      };
    } catch (error) {
      // Fail CLOSED, not open: this endpoint gates dashboard access (canEdit,
      // canUseIntegrations, dashboardReadOnly). A transient DB blip must not
      // make a locked/expired-trial or canceled account appear fully unlocked
      // -- that previously caused exactly this: refresh the page while the
      // gateway hits a momentary DB hiccup and every gate opens until the next
      // successful fetch. Actual voice-call blocking is separately enforced by
      // enforceCallAllowed() (already fail-closed); this only affects dashboard UI.
      logger.error('getAccountState failed; failing closed (locked)', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        mode: 'locked',
        canCall: false,
        canEdit: false,
        canUseIntegrations: false,
        dashboardReadOnly: true,
        accountStateError: true,
        trial: {
          isTrialing: false,
          isLocked: true,
          blockReason: 'Could not verify your account status. Please refresh — if this persists, contact support.',
        },
        subscription: null,
        warnings: [],
        usage: { callMinutes: 0, limitMinutes: 0 },
        overage: { overageMinutes: 0, overageCost: 0 },
        dailyUsage: [],
      };
    }
  }

  async createCheckoutSession(
    tenantId: string,
    plan: string,
    email: string,
    successUrl: string,
    cancelUrl: string,
    billingInterval: BillingInterval = 'monthly'
  ): Promise<string> {
    const planKey = parsePlanKey(plan);
    if (!planKey || !PLANS[plan]) throw new Error(`Unknown plan: ${plan}`);

    const sub = await this.getSubscription(tenantId);
    let customerId = sub?.stripeCustomerId;
    const endedStatuses = new Set(['canceled', 'cancelled', 'incomplete', 'unpaid']);
    const needsNewCheckout =
      !sub?.stripeSubscriptionId ||
      endedStatuses.has(String(sub?.status || '').toLowerCase()) ||
      sub?.cancelAtPeriodEnd === true;

    if (!customerId) {
      customerId = await this.createCustomer(tenantId, email, email);
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    await pool.query(
      `INSERT INTO public.subscriptions (tenant_id, stripe_customer_id, plan, status, current_period_start, current_period_end, included_minutes)
       VALUES ($1, $2, $3, 'incomplete', $4, $5, $6)
       ON CONFLICT (tenant_id) DO UPDATE SET
         stripe_customer_id = COALESCE(public.subscriptions.stripe_customer_id, EXCLUDED.stripe_customer_id),
         plan = EXCLUDED.plan,
         status = CASE
           WHEN $7::boolean THEN 'incomplete'
           ELSE public.subscriptions.status
         END,
         cancel_at_period_end = CASE WHEN $7::boolean THEN false ELSE public.subscriptions.cancel_at_period_end END,
         updated_at = NOW()`,
      [tenantId, customerId, plan, now, periodEnd, PLANS[plan].includedMinutes, needsNewCheckout]
    );

    const { priceId } = await resolveSubscriptionPriceId(planKey, billingInterval);

    const session = await requireStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: { tenantId, plan, billingInterval },
      },
      metadata: { tenantId, plan, billingInterval },
      allow_promotion_codes: true,
    });

    if (!session.url) throw new Error('Failed to create checkout session');
    return session.url;
  }
}

export const billingService = new BillingService();

