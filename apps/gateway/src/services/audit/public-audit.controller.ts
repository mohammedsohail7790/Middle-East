import { Router } from 'express';
import Stripe from 'stripe';
import { asyncHandler, MiddlewareFactory } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import { logger } from '../logger.js';
import { escapeHtml, renderDetailList } from '../automation/email-template.js';
import { verifyLink, type LinkPayload } from './signed-link.js';
import { auditPrices, formatPrice, isAuditCurrency, minorUnits } from './audit-pricing.js';
import { AUDIT_FIELD_IDS, AUDIT_QUESTIONS, AUDIT_SECTIONS } from './audit-form-definition.js';
import { sendAuditMail } from './audit-mail.js';

/**
 * The paid Opportunity Audit, after the call and the NDA: a private link opens Form 2 (the audit questionnaire), and a second private link, sent with the "audit ready"
 * email, opens the payment page. There is no login and nothing is stored on our side: answers and payments reach us by email, and the links carry their own expiry.
 */

const SITE = process.env.PUBLIC_SITE_URL || 'https://hallaai.com';
const PAYMENT_WINDOW_DAYS = 5;

const readLimit = MiddlewareFactory.createRateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: 'Too many requests. Please try again later.' });
const writeLimit = MiddlewareFactory.createRateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many requests. Please try again later or email hello@hallaai.com.' });

const MAX_ANSWER_CHARS = 4000;
const MAX_TOTAL_CHARS = 60000;

const stripeClient = (): Stripe | null => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-08-26.dahlia' }) : null);

type Checked = { ok: boolean; payload?: LinkPayload; status?: number; error?: string };

function checkToken(token: unknown, kind: LinkPayload['k']): Checked {
  const secret = process.env.AUDIT_LINK_SECRET;
  if (!secret) return { ok: false, status: 503, error: 'This service is not set up yet. Please email hello@hallaai.com.' };
  const result = verifyLink(String(token ?? ''), secret);
  if (!result.ok) {
    return (result as { reason: string }).reason === 'expired'
      ? { ok: false, status: 410, error: 'This link has expired. Please email hello@hallaai.com and we will help.' }
      : { ok: false, status: 400, error: 'This link is not valid. Please check you opened the whole link from our email, or write to hello@hallaai.com.' };
  }
  const payload = (result as { payload: LinkPayload }).payload;
  if (payload.k !== kind) return { ok: false, status: 400, error: 'This link is not valid for this page. Please write to hello@hallaai.com.' };
  return { ok: true, payload: (result as { payload: LinkPayload }).payload };
}

export function createPublicAuditRouter(): Router {
  const router = Router();

  // Is this link good, and what is it for? Used by the pages to show the company name and the price before anything is submitted.
  router.get(
    '/link',
    readLimit,
    validate({ query: { t: { type: 'string', required: true, maxLength: 2000 } }, allowOnlyQuery: ['t'] }),
    asyncHandler(async (req: any, res: any) => {
      const t = String(req.query.t ?? '');
      const secret = process.env.AUDIT_LINK_SECRET;
      if (!secret) {
        res.status(503).json({ valid: false, error: 'This service is not set up yet. Please email hello@hallaai.com.' });
        return;
      }
      const result = verifyLink(t, secret);
      if (!result.ok) {
        const reason = (result as { reason: string }).reason;
        const expired = reason === 'expired';
        res.status(expired ? 410 : 400).json({ valid: false, expired, error: expired ? 'This link has expired.' : 'This link is not valid.' });
        return;
      }
      const p = (result as { payload: LinkPayload }).payload;
      const base = { valid: true, kind: p.k, company: p.company, expiresAt: new Date(p.x * 1000).toISOString() };
      if (p.k === 'pay') {
        const prices = auditPrices();
        const price = isAuditCurrency(p.cur) ? prices[p.cur] : undefined;
        res.json({ ...base, currency: p.cur ?? null, priceAvailable: price !== undefined, priceText: price !== undefined && isAuditCurrency(p.cur) ? formatPrice(p.cur, price) : null, windowDays: PAYMENT_WINDOW_DAYS });
        return;
      }
      res.json(base);
    })
  );

  // Form 2: the client submits the audit questionnaire. The answers come to us by email.
  router.post(
    '/form2',
    writeLimit,
    validate({ body: { token: { type: 'string', required: true, maxLength: 2000 }, answers: { type: 'object', required: true } }, allowOnlyBody: ['token', 'answers'] }),
    asyncHandler(async (req: any, res: any) => {
      const checked = checkToken(req.body.token, 'form2');
      if (!checked.ok) {
        res.status(checked.status).json({ error: checked.error });
        return;
      }
      const p = checked.payload as LinkPayload;
      const raw = req.body.answers as Record<string, unknown>;
      const answers: Record<string, string> = {};
      let total = 0;
      for (const [key, value] of Object.entries(raw)) {
        if (!AUDIT_FIELD_IDS.has(key)) {
          res.status(400).json({ error: `Unexpected question "${key}".` });
          return;
        }
        if (typeof value !== 'string') {
          res.status(400).json({ error: 'Answers must be text.' });
          return;
        }
        const text = value.trim();
        if (text.length > MAX_ANSWER_CHARS) {
          res.status(400).json({ error: 'One of the answers is too long. Please shorten it or send the details by email.' });
          return;
        }
        if (!text) continue;
        total += text.length;
        answers[key] = text;
      }
      if (total > MAX_TOTAL_CHARS) {
        res.status(400).json({ error: 'The answers are too long to send in one go. Please shorten them or send details by email.' });
        return;
      }
      if (!answers.p1_name || !answers.p1_steps) {
        res.status(400).json({ error: 'Please describe at least the first process: what it is called and the steps.' });
        return;
      }

      const sections = AUDIT_SECTIONS.map((section) => {
        const rows = section.questions
          .filter((question) => answers[question.id])
          .map((question) => {
            const m = /^(p|s)(\d+)_/.exec(question.id);
            const prefix = m ? `${m[1] === 'p' ? 'Process' : 'System'} ${m[2]}: ` : '';
            return { label: prefix + question.label, value: answers[question.id] };
          });
        return rows.length ? `<h3 style="margin: 22px 0 0; font-size: 15px;">${escapeHtml(section.title)}</h3>${renderDetailList(rows)}` : '';
      }).join('');
      const answered = Object.keys(answers).length;
      const intro = `<p style="margin: 0 0 6px;"><b>${escapeHtml(p.company)}</b> submitted the audit questionnaire.</p><p style="margin: 0 0 6px;">Contact: ${escapeHtml(p.email)}. Reference: ${escapeHtml(p.id)}. ${answered} of ${AUDIT_QUESTIONS.length} questions answered.</p><p style="margin: 0 0 6px;"><b>Next:</b> do the analysis (about one week), then email the client the payment link. The audit is delivered once it is paid. The link is valid for ${PAYMENT_WINDOW_DAYS} days.</p>`;

      try {
        const sent = await sendAuditMail({ eyebrow: 'Audit questionnaire', title: `${p.company} submitted Form 2`, subject: `Form 2 received — ${p.company}`, bodyHtml: intro + sections, replyTo: p.email });
        if (sent === 'not-configured') {
          logger.error('[Audit] RESEND_API_KEY not configured, cannot deliver Form 2');
          res.status(503).json({ error: 'Email delivery is not configured. Please email hello@hallaai.com directly.' });
          return;
        }
      } catch (error) {
        logger.error('[Audit] Failed to send Form 2 email', undefined, error instanceof Error ? error : new Error(String(error)));
        res.status(502).json({ error: 'Could not deliver your answers. Please email hello@hallaai.com directly.' });
        return;
      }
      res.status(200).json({ ok: true });
    })
  );

  // The payment page: create a Stripe Checkout session for the audit fee in the client's currency.
  router.post(
    '/pay',
    writeLimit,
    validate({ body: { token: { type: 'string', required: true, maxLength: 2000 } }, allowOnlyBody: ['token'] }),
    asyncHandler(async (req: any, res: any) => {
      const checked = checkToken(req.body.token, 'pay');
      if (!checked.ok) {
        res.status(checked.status).json({ error: checked.error });
        return;
      }
      const p = checked.payload as LinkPayload;
      if (!isAuditCurrency(p.cur)) {
        res.status(409).json({ error: 'We could not work out the currency for this payment. Please write to hello@hallaai.com.' });
        return;
      }
      const price = auditPrices()[p.cur];
      if (price === undefined) {
        res.status(409).json({ error: 'The audit price in your currency is not available yet. Please write to hello@hallaai.com and we will send an invoice.' });
        return;
      }
      const stripe = stripeClient();
      if (!stripe) {
        res.status(503).json({ error: 'Online payment is not set up yet. Please write to hello@hallaai.com.' });
        return;
      }
      try {
        const metadata = { kind: 'audit', link_id: p.id, company: p.company.slice(0, 200) };
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: p.email || undefined,
          line_items: [{ quantity: 1, price_data: { currency: p.cur.toLowerCase(), unit_amount: minorUnits(p.cur, price), product_data: { name: 'Halla AI Opportunity Audit', description: `For ${p.company}` } }, ...(process.env.AUDIT_TAX_RATE_ID ? { tax_rates: [process.env.AUDIT_TAX_RATE_ID] } : {}) }],
          metadata,
          payment_intent_data: { metadata },
          success_url: `${SITE}/audit/paid`,
          cancel_url: `${SITE}/audit/pay?t=${encodeURIComponent(String(req.body.token))}`,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
        res.json({ url: session.url });
      } catch (error) {
        logger.error('[Audit] Stripe checkout failed', undefined, error instanceof Error ? error : new Error(String(error)));
        res.status(502).json({ error: 'We could not start the payment. Please try again, or write to hello@hallaai.com.' });
      }
    })
  );

  return router;
}

/**
 * Stripe tells us the audit has been paid. This is its own endpoint with its own signing secret (AUDIT_STRIPE_WEBHOOK_SECRET), so the subscription billing webhook is untouched.
 * Mounted with express.raw() before the JSON parser. We email Hk and the owner; the audit is then delivered by hand.
 */
export async function handleAuditStripeWebhook(req: any, res: any): Promise<void> {
  const secret = process.env.AUDIT_STRIPE_WEBHOOK_SECRET;
  const stripe = stripeClient();
  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!secret || !stripe) {
    res.status(503).json({ error: 'Not configured' });
    return;
  }
  if (!sig || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: 'Missing signature or raw body' });
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch {
    res.status(400).json({ error: 'Signature verification failed' });
    return;
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind === 'audit' && session.payment_status === 'paid') {
      const cur = String(session.currency ?? '').toUpperCase();
      const paid = isAuditCurrency(cur) && session.amount_total != null ? formatPrice(cur, session.amount_total / (['KWD', 'BHD', 'OMR'].includes(cur) ? 1000 : 100)) : `${session.amount_total} ${cur}`;
      const rows = [
        { label: 'Company', value: session.metadata.company ?? '—' },
        { label: 'Paid', value: paid },
        { label: 'Client email', value: session.customer_details?.email ?? session.customer_email ?? '—' },
        { label: 'Reference', value: session.metadata.link_id ?? '—' },
        { label: 'Stripe payment', value: typeof session.payment_intent === 'string' ? session.payment_intent : '—' },
      ];
      try {
        await sendAuditMail({
          eyebrow: 'Audit paid',
          title: `${session.metadata.company ?? 'A client'} paid for the audit`,
          subject: `Audit PAID — ${session.metadata.company ?? 'client'} (${paid})`,
          bodyHtml: `<p style="margin: 0 0 6px; font-size: 16px; font-weight: 700;">Payment received. Deliver the audit to the client.</p>${renderDetailList(rows)}`,
          replyTo: session.customer_details?.email ?? undefined,
        });
      } catch (error) {
        logger.error('[Audit] Paid notification failed', undefined, error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({ error: 'Could not send the notification' }); // Stripe retries, so the notification is not lost
        return;
      }
    }
  }
  res.json({ received: true });
}
