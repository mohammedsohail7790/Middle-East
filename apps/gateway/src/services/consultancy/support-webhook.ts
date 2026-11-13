import type Stripe from 'stripe';
import type { Pool } from 'pg';
import { logger } from '../logger.js';
import { getPlan, getPlanBySubscription, setStatus, type SupportPlan } from './support-store.js';
import { sendPastDueAlert } from './support-mail.js';

/**
 * The support-plan part of the Stripe webhook (called from handleAuditStripeWebhook after the signature is verified):
 *   checkout.session.completed (metadata kind support_plan) -> plan active, subscription id and start date stored
 *   invoice.payment_failed -> past_due and the team is emailed     invoice.paid -> past_due clears     customer.subscription.deleted -> cancelled
 * Events for plans we do not know are ignored. Every transition only happens from the state it makes sense from, so a replayed event changes nothing and sends no second email.
 * Throws only for a database or mail failure, so the caller answers 500 and Stripe retries.
 */
export interface SupportWebhookDeps {
  pool: Pick<Pool, 'query'>;
  pastDueMail: (plan: SupportPlan) => Promise<void>;
}

export async function defaultSupportWebhookDeps(): Promise<SupportWebhookDeps> {
  const { pool } = await import('../db/pool.js');
  return { pool, pastDueMail: (p) => sendPastDueAlert(p) };
}

const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as any).id === 'string' ? (v as any).id : null);

/** The subscription an invoice belongs to: `subscription` on older API versions, `parent.subscription_details.subscription` on newer ones. */
export function invoiceSubscriptionId(invoice: any): string | null {
  return idOf(invoice?.subscription) ?? idOf(invoice?.parent?.subscription_details?.subscription);
}

const SUPPORT_EVENTS = new Set(['checkout.session.completed', 'invoice.payment_failed', 'invoice.paid', 'customer.subscription.deleted']);

export async function handleSupportEvent(event: Stripe.Event, inject?: Partial<SupportWebhookDeps>): Promise<'handled' | 'ignored'> {
  if (!SUPPORT_EVENTS.has(event.type)) return 'ignored';
  const obj = event.data.object as any;
  if (event.type === 'checkout.session.completed' && obj?.metadata?.kind !== 'support_plan') return 'ignored';
  const deps: SupportWebhookDeps = { ...(await defaultSupportWebhookDeps()), ...inject };

  if (event.type === 'checkout.session.completed') {
    const planId = String(obj.metadata.planId ?? '');
    const plan = planId ? await getPlan(deps.pool, planId).catch(() => null) : null;
    if (!plan) return 'ignored';
    if (obj.payment_status !== 'paid' && obj.payment_status !== 'no_payment_required') return 'ignored';
    if (plan.status !== 'pending') {
      // Normally a replay. If the plan was cancelled the client has paid for something we closed, so say so loudly for the team to refund or reopen it.
      if (plan.status === 'cancelled') logger.error(`[Support] Payment received for a cancelled support plan (${plan.id}). Refund it or reopen the plan.`);
      return 'handled';
    }
    await setStatus(deps.pool, plan.id, 'active', { subscriptionId: idOf(obj.subscription) ?? undefined, startedOn: true });
    return 'handled';
  }

  if (event.type === 'customer.subscription.deleted') {
    const subId = idOf(obj);
    const plan = (subId ? await getPlanBySubscription(deps.pool, subId) : null) ?? (obj?.metadata?.kind === 'support_plan' && obj.metadata.planId ? await getPlan(deps.pool, String(obj.metadata.planId)).catch(() => null) : null);
    if (!plan) return 'ignored';
    if (plan.status !== 'cancelled') await setStatus(deps.pool, plan.id, 'cancelled');
    return 'handled';
  }

  // invoice.payment_failed / invoice.paid
  const subId = invoiceSubscriptionId(obj);
  const plan = subId ? await getPlanBySubscription(deps.pool, subId) : null;
  if (!plan) return 'ignored';
  if (event.type === 'invoice.payment_failed') {
    if (plan.status !== 'active') return 'handled'; // already past due (Stripe retries), cancelled or not started
    await setStatus(deps.pool, plan.id, 'past_due');
    try {
      await deps.pastDueMail({ ...plan, status: 'past_due' });
    } catch (error) {
      logger.error('[Support] Past-due email failed', undefined, error instanceof Error ? error : new Error(String(error)));
    }
    return 'handled';
  }
  if (plan.status === 'past_due') await setStatus(deps.pool, plan.id, 'active');
  return 'handled';
}
