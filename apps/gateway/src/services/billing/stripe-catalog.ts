/**
 * Stripe plan catalog — price resolution from env price IDs or Stripe product IDs.
 */
import Stripe from 'stripe';
import { logger } from '../logger.js';
import { BillingNotConfiguredError } from './billing-errors.js';

export type PlanKey = 'essential' | 'professional';
export type BillingInterval = 'monthly' | 'annual';

const PLAN_KEYS: PlanKey[] = ['essential', 'professional'];

/** Halla AI Stripe products (reused from the same account as the earlier Call IQ product; safe to commit — not secret). Override via env on Render. */
const DEFAULT_STRIPE_PRODUCTS: Record<PlanKey, Record<BillingInterval, string>> = {
  essential: {
    monthly: 'prod_UevJDYfmBcR9Id',
    annual: 'prod_UevhigbubpTIss',
  },
  professional: {
    monthly: 'prod_Ueva77AVpYACtF',
    annual: 'prod_Uevj6K92uWuwiv',
  },
};

const PRICE_ENV: Record<PlanKey, Record<BillingInterval, string>> = {
  essential: {
    monthly: 'STRIPE_ESSENTIAL_PRICE_ID',
    annual: 'STRIPE_ESSENTIAL_ANNUAL_PRICE_ID',
  },
  professional: {
    monthly: 'STRIPE_PROFESSIONAL_PRICE_ID',
    annual: 'STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID',
  },
};

const PRODUCT_ENV: Record<PlanKey, Record<BillingInterval, string>> = {
  essential: {
    monthly: 'STRIPE_ESSENTIAL_PRODUCT_ID_MONTHLY',
    annual: 'STRIPE_ESSENTIAL_PRODUCT_ID_ANNUAL',
  },
  professional: {
    monthly: 'STRIPE_PROFESSIONAL_PRODUCT_ID_MONTHLY',
    annual: 'STRIPE_PROFESSIONAL_PRODUCT_ID_ANNUAL',
  },
};

const OVERAGE_ENV: Record<PlanKey, string> = {
  essential: 'STRIPE_ESSENTIAL_OVERAGE_ID',
  professional: 'STRIPE_PROFESSIONAL_OVERAGE_ID',
};

const PLACEHOLDER_PRICE = /^price_(essential|professional)(_annual)?(_overage)?$/;

type CachedPrice = { priceId: string; unitAmount: number | null; expiresAt: number };

const priceCache = new Map<string, CachedPrice>();
const CACHE_TTL_MS = 15 * 60_000;

let stripeClient: Stripe | null = null;

function getStripe(): Stripe | null {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || key === 'sk_test_placeholder') return null;
  stripeClient = new Stripe(key, { apiVersion: '2026-07-29.dahlia' });
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return !!getStripe();
}

function envTrim(name: string): string {
  return process.env[name]?.trim() || '';
}

function getProductId(plan: PlanKey, interval: BillingInterval): string {
  const fromEnv = envTrim(PRODUCT_ENV[plan][interval]);
  if (fromEnv) return fromEnv;
  return DEFAULT_STRIPE_PRODUCTS[plan][interval];
}

function getDirectPriceId(plan: PlanKey, interval: BillingInterval): string | null {
  const id = envTrim(PRICE_ENV[plan][interval]);
  if (!id || PLACEHOLDER_PRICE.test(id)) return null;
  return id;
}

export function getOveragePriceId(plan: PlanKey): string | null {
  const id = envTrim(OVERAGE_ENV[plan]);
  if (!id || PLACEHOLDER_PRICE.test(id) || id.endsWith('_overage')) return null;
  return id;
}

function stripeInterval(interval: BillingInterval): Stripe.Price.Recurring.Interval {
  return interval === 'annual' ? 'year' : 'month';
}

export async function resolveSubscriptionPriceId(
  plan: PlanKey,
  interval: BillingInterval
): Promise<{ priceId: string; unitAmountCents: number | null }> {
  const direct = getDirectPriceId(plan, interval);
  if (direct) return { priceId: direct, unitAmountCents: null };

  const cacheKey = `${plan}:${interval}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return { priceId: cached.priceId, unitAmountCents: cached.unitAmount };
  }

  const stripe = getStripe();
  if (!stripe) {
    throw new BillingNotConfiguredError();
  }

  const productId = getProductId(plan, interval);
  const wantInterval = stripeInterval(interval);
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 24 });

  const recurring = prices.data.filter((p) => p.type === 'recurring' && p.recurring);
  const match =
    recurring.find((p) => p.recurring?.interval === wantInterval) ||
    recurring.find((p) => p.recurring?.interval_count === 1) ||
    recurring[0];

  if (!match?.id) {
    throw new Error(
      `No active ${interval} price found for Stripe product ${productId} (${plan}). ` +
        `Create a recurring price in Stripe or set ${PRICE_ENV[plan][interval]}.`
    );
  }

  const entry: CachedPrice = {
    priceId: match.id,
    unitAmount: match.unit_amount,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  priceCache.set(cacheKey, entry);

  logger.info('STRIPE_PRICE_RESOLVED', {
    plan,
    interval,
    productId,
    priceId: match.id,
    unitAmount: match.unit_amount,
  });

  return { priceId: match.id, unitAmountCents: match.unit_amount };
}

export function parseBillingInterval(raw: unknown): BillingInterval {
  if (raw === 'annual' || raw === 'year' || raw === 'yearly') return 'annual';
  return 'monthly';
}

export function parsePlanKey(raw: unknown): PlanKey | null {
  const key = String(raw || '').toLowerCase();
  return PLAN_KEYS.includes(key as PlanKey) ? (key as PlanKey) : null;
}

export async function warmStripePriceCache(): Promise<void> {
  if (!isStripeConfigured()) return;
  for (const plan of PLAN_KEYS) {
    for (const interval of ['monthly', 'annual'] as BillingInterval[]) {
      try {
        await resolveSubscriptionPriceId(plan, interval);
      } catch (err) {
        logger.warn('STRIPE_PRICE_WARM_FAILED', {
          plan,
          interval,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

export async function validateStripeBillingConfig(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  if (!isStripeConfigured()) {
    logger.warn(
      'STRIPE_SECRET_KEY not set — paid checkout disabled (free trial still works).'
    );
    return;
  }
  if (!envTrim('STRIPE_WEBHOOK_SECRET')) {
    logger.warn('STRIPE_WEBHOOK_SECRET not set — subscription webhooks will fail.');
  }

  const failures: string[] = [];
  for (const plan of PLAN_KEYS) {
    for (const interval of ['monthly', 'annual'] as BillingInterval[]) {
      try {
        await resolveSubscriptionPriceId(plan, interval);
      } catch (err) {
        failures.push(
          `${plan}/${interval}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  if (failures.length) {
    logger.error('STRIPE_BILLING_CONFIG_INVALID', { failures });
  } else {
    logger.info('STRIPE_BILLING_CONFIG_OK', { plans: PLAN_KEYS, intervals: ['monthly', 'annual'] });
  }
}
