import Stripe from 'stripe';
import { auditStripeKey } from '../audit/public-audit.controller.js';
import { SITE } from '../audit/audit-links.js';
import { KIND_LABEL } from './support-mail.js';
import type { SupportPlan } from './support-store.js';

/** Currencies Stripe counts in thousandths. Our stored price is always in hundredths of the unit, so these are multiplied by 10 for Stripe (as the audit does). */
const THREE_DECIMALS = new Set(['KWD', 'BHD', 'OMR']);

export const stripeAmount = (plan: Pick<SupportPlan, 'price_minor' | 'currency'>): number => (THREE_DECIMALS.has(plan.currency) ? plan.price_minor * 10 : plan.price_minor);

/** Same Stripe account and keys as the paid audit. Null when no key is set. */
export function supportStripe(): Stripe | null {
  const key = auditStripeKey();
  return key ? new Stripe(key, { apiVersion: '2026-08-26.dahlia' }) : null;
}

/**
 * Parameters for a Checkout Session with inline price_data, so no product has to exist in Stripe: a monthly subscription for standard, extended and partner,
 * a one-time payment for training. The plan id travels in the metadata (also on the subscription, so invoice events can be matched).
 */
export function checkoutParams(plan: SupportPlan, nowSec: number = Math.floor(Date.now() / 1000)): Stripe.Checkout.SessionCreateParams {
  const metadata = { kind: 'support_plan', planId: plan.id };
  const recurring = plan.kind !== 'training';
  const label = KIND_LABEL[plan.kind] ?? 'Support';
  const product_data = { name: `Halla AI ${label}`, ...(plan.company ? { description: `For ${plan.company}` } : {}) };
  const unit_amount = stripeAmount(plan);
  const currency = plan.currency.toLowerCase();
  const base = {
    customer_email: plan.email || undefined,
    metadata,
    success_url: `${SITE}/?support=paid`,
    cancel_url: `${SITE}/?support=cancelled`,
    // Stripe's minimum is 30 minutes; a day is long enough for the client to open the email.
    expires_at: nowSec + 24 * 3600,
  };
  if (recurring) {
    return {
      ...base,
      mode: 'subscription',
      line_items: [{ quantity: 1, price_data: { currency, unit_amount, recurring: { interval: 'month' }, product_data }, ...(process.env.AUDIT_TAX_RATE_ID ? { tax_rates: [process.env.AUDIT_TAX_RATE_ID] } : {}) }],
      subscription_data: { metadata },
    };
  }
  return {
    ...base,
    mode: 'payment',
    line_items: [{ quantity: 1, price_data: { currency, unit_amount, product_data }, ...(process.env.AUDIT_TAX_RATE_ID ? { tax_rates: [process.env.AUDIT_TAX_RATE_ID] } : {}) }],
    payment_intent_data: { metadata },
  };
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
  /** True when an earlier, still-open session was reused instead of creating a second one. */
  reused: boolean;
}

/** Reuses the plan's open session if Stripe still says it is open; otherwise creates a new one. */
export async function ensureCheckoutSession(stripe: Pick<Stripe, 'checkout'>, plan: SupportPlan): Promise<CheckoutResult> {
  if (plan.stripe_checkout_session_id) {
    try {
      const old = await stripe.checkout.sessions.retrieve(plan.stripe_checkout_session_id);
      if (old.status === 'open' && old.url) return { url: old.url, sessionId: old.id, reused: true };
    } catch {
      /* the old session cannot be read: make a new one */
    }
  }
  const session = await stripe.checkout.sessions.create(checkoutParams(plan));
  if (!session.url) throw new Error('Stripe returned no checkout link');
  return { url: session.url, sessionId: session.id, reused: false };
}
