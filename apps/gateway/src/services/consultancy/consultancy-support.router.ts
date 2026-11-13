import { Router } from 'express';
import type { Pool } from 'pg';
import { logger } from '../logger.js';
import { adminEmail } from './admin-access.js';
import {
  createPlan, deleteHours, getPlan, listHours, listPlans, logHours, recentMonths, setCheckoutSession, setStatus, SupportError, usageFor,
  type SupportPlan,
} from './support-store.js';
import { sendHoursAlert, sendSupportPaymentLink } from './support-mail.js';
import { ensureCheckoutSession, supportStripe } from './support-checkout.js';

/**
 * Team-side consultancy API: support plans and hours. Mounted at /api/v1/consultancy-admin/support behind requireConsultancyAdmin (see consultancy-admin.router.ts),
 * so every route here is already limited to the team.
 */
export interface SupportRouterDeps {
  pool?: Pick<Pool, 'query'>;
  stripe?: () => any | null;
  sendPaymentLink?: typeof sendSupportPaymentLink;
  sendAlert?: typeof sendHoursAlert;
  now?: () => Date;
}

const ok = (res: any, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const fail = (res: any, e: unknown) => {
  if (e instanceof SupportError) return res.status(e.status).json({ success: false, error: e.message });
  logger.error('[Support] Request failed', undefined, e instanceof Error ? e : new Error(String(e)));
  return res.status(500).json({ success: false, error: 'Something went wrong' });
};
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function createSupportRouter(deps: SupportRouterDeps = {}): Router {
  const router = Router();
  const getPool = async () => deps.pool ?? (await import('../db/pool.js')).pool;
  const now = () => (deps.now ? deps.now() : new Date());
  const stripeOf = deps.stripe ?? supportStripe;
  const sendLink = deps.sendPaymentLink ?? sendSupportPaymentLink;
  const sendAlert = deps.sendAlert ?? sendHoursAlert;

  /** Loads the plan named in the URL or ends the request with 404. */
  async function loadPlan(pool: any, req: any, res: any): Promise<SupportPlan | null> {
    const id = req.params.id;
    const plan = isUuid(id) ? await getPlan(pool, id) : null;
    if (!plan) {
      res.status(404).json({ success: false, error: 'Plan not found' });
      return null;
    }
    return plan;
  }

  router.get('/', async (_req, res) => {
    try {
      const pool = await getPool();
      const plans = await listPlans(pool);
      const month = recentMonths(now(), 0)[0];
      const rows = [];
      for (const plan of plans) rows.push({ ...plan, usage: await usageFor(pool, plan.id, month, plan) });
      ok(res, rows);
    } catch (e) {
      fail(res, e);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const b = req.body ?? {};
      if (!isUuid(b.leadId)) throw new SupportError('Choose a lead');
      const plan = await createPlan(await getPool(), { leadId: b.leadId, kind: b.kind, priceMinor: b.priceMinor, hoursIncluded: b.hoursIncluded, projectId: b.projectId });
      ok(res, plan, 201);
    } catch (e) {
      fail(res, e);
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const pool = await getPool();
      const plan = await loadPlan(pool, req, res);
      if (!plan) return;
      const months = recentMonths(now());
      const usage = [];
      for (const m of months) usage.push(await usageFor(pool, plan.id, m, plan));
      ok(res, { plan, usage, hours: await listHours(pool, plan.id) });
    } catch (e) {
      fail(res, e);
    }
  });

  router.post('/:id/hours', async (req, res) => {
    try {
      const pool = await getPool();
      const plan = await loadPlan(pool, req, res);
      if (!plan) return;
      const b = req.body ?? {};
      const result = await logHours(pool, plan.id, { hours: b.hours, workedOn: b.workedOn, note: b.note, loggedBy: adminEmail(req) || undefined }, now());
      // Alerts are best effort: a mail failure must not hide the fact that the hours were saved.
      for (const level of result.crossed) {
        try {
          await sendAlert(plan, result.usage, level);
        } catch (error) {
          logger.error('[Support] Hours alert failed', undefined, error instanceof Error ? error : new Error(String(error)));
        }
      }
      ok(res, result, 201);
    } catch (e) {
      fail(res, e);
    }
  });

  router.delete('/:id/hours/:hourId', async (req, res) => {
    try {
      const pool = await getPool();
      const plan = await loadPlan(pool, req, res);
      if (!plan) return;
      if (!isUuid(req.params.hourId) || !(await deleteHours(pool, plan.id, req.params.hourId))) {
        res.status(404).json({ success: false, error: 'Hours entry not found' });
        return;
      }
      ok(res, { deleted: true });
    } catch (e) {
      fail(res, e);
    }
  });

  router.post('/:id/checkout', async (req, res) => {
    try {
      const pool = await getPool();
      const plan = await loadPlan(pool, req, res);
      if (!plan) return;
      if (plan.status !== 'pending') throw new SupportError(`This plan is already ${plan.status.replace('_', ' ')}, so it needs no payment link`, 409);
      const stripe = stripeOf();
      if (!stripe) throw new SupportError('Stripe is not set up (AUDIT_STRIPE_SECRET_KEY)', 503);
      const checkout = await ensureCheckoutSession(stripe, plan);
      if (checkout.sessionId !== plan.stripe_checkout_session_id) await setCheckoutSession(pool, plan.id, checkout.sessionId);
      // A reused link is only emailed again when the team asks (resend: true), so the client is not emailed twice by a double click.
      let emailed: 'sent' | 'not-configured' | 'no-email' | 'skipped' = 'skipped';
      if (!checkout.reused || req.body?.resend === true) {
        try {
          emailed = await sendLink(plan, checkout.url);
        } catch (error) {
          logger.error('[Support] Payment link email failed', undefined, error instanceof Error ? error : new Error(String(error)));
          emailed = 'not-configured';
        }
      }
      ok(res, { url: checkout.url, reused: checkout.reused, emailed });
    } catch (e) {
      fail(res, e);
    }
  });

  router.post('/:id/cancel', async (req, res) => {
    try {
      const pool = await getPool();
      const plan = await loadPlan(pool, req, res);
      if (!plan) return;
      if (plan.status === 'cancelled') throw new SupportError('This plan is already cancelled', 409);
      if (plan.stripe_subscription_id) {
        const stripe = stripeOf();
        if (!stripe) throw new SupportError('Stripe is not set up (AUDIT_STRIPE_SECRET_KEY)', 503);
        // Ends at the end of the month already paid for. The plan turns "cancelled" when Stripe sends customer.subscription.deleted.
        await stripe.subscriptions.update(plan.stripe_subscription_id, { cancel_at_period_end: true });
        ok(res, { plan, cancelsAtPeriodEnd: true });
        return;
      }
      // A pending plan may have an open payment link; close it so the client cannot still pay for a cancelled plan.
      if (plan.stripe_checkout_session_id) {
        try {
          await stripeOf()?.checkout.sessions.expire(plan.stripe_checkout_session_id);
        } catch {
          /* already expired or paid; nothing to close */
        }
      }
      const updated = await setStatus(pool, plan.id, 'cancelled');
      ok(res, { plan: updated, cancelsAtPeriodEnd: false });
    } catch (e) {
      fail(res, e);
    }
  });

  return router;
}
