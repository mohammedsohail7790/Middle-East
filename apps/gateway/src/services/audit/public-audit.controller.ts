import { Router } from 'express';
import Stripe from 'stripe';
import { asyncHandler, MiddlewareFactory } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import { logger } from '../logger.js';
import { escapeHtml, renderCallout, renderDetailList, renderSummaryStrip } from '../automation/email-template.js';
import { verifyLink, type LinkPayload } from './signed-link.js';
import { auditPrices, formatPrice, isAuditCurrency, minorUnits, priceText } from './audit-pricing.js';
import { AUDIT_FIELD_IDS, AUDIT_QUESTIONS, AUDIT_SECTIONS } from './audit-form-definition.js';
import { sendAuditMail } from './audit-mail.js';
import { sendClientAuditMail, para } from './audit-client-mail.js';
import { paymentUrl, questionnaireUrl, PAYMENT_WINDOW_DAYS, QUESTIONNAIRE_DAYS } from './audit-links.js';
import { createAuditReviewRouter } from './audit-review.controller.js';
import { handlePaid, startDraft } from './audit-pipeline.js';
import { markLeadStatusSafe } from '../consultancy/lead-store.js';
import { handleSupportEvent } from '../consultancy/support-webhook.js';

/**
 * The paid Opportunity Audit. The flow runs on its own: the fit-check email has a button that emails the client a private link to Form 2 (the audit questionnaire); submitting it
 * emails the client a second private link, to the payment page; Stripe's webhook tells us it is paid and confirms to the client. The analysis itself is done by hand after payment.
 * There is no login and nothing is stored on our side: answers and payments reach us by email, and the links carry their own expiry.
 */

const SITE = process.env.PUBLIC_SITE_URL || 'https://hallaai.com';

/** Emails already sent from our buttons, so a second click does not email the client twice. They live in memory, so a restart forgets them; the links also expire. */
const approvedIds = new Set<string>();
const paymentSentIds = new Set<string>();

const page = (title: string, bodyHtml: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>` +
  `<body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1f27"><div style="max-width:520px;margin:48px auto;background:#fff;border:1px solid #e3e0d8;border-radius:12px;padding:28px"><h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(title)}</h1>${bodyHtml}</div></body></html>`;

const readLimit = MiddlewareFactory.createRateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: 'Too many requests. Please try again later.' });
const writeLimit = MiddlewareFactory.createRateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many requests. Please try again later or email hello@hallaai.com.' });

const MAX_ANSWER_CHARS = 4000;
const MAX_TOTAL_CHARS = 60000;

/**
 * The Stripe key for audit payments. AUDIT_STRIPE_SECRET_KEY lets the audit be paid into its own Stripe account (and the AUDIT_STRIPE_WEBHOOK_SECRET must come from that same account);
 * without it the shared STRIPE_SECRET_KEY is used. The subscription billing keeps using STRIPE_SECRET_KEY only.
 */
export function auditStripeKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.AUDIT_STRIPE_SECRET_KEY?.trim() || env.STRIPE_SECRET_KEY?.trim() || undefined;
}

const stripeClient = (): Stripe | null => {
  const key = auditStripeKey();
  return key ? new Stripe(key, { apiVersion: '2026-08-26.dahlia' }) : null;
};

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
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(createAuditReviewRouter());

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
        res.json({ ...base, currency: p.cur ?? null, priceAvailable: price !== undefined, priceText: isAuditCurrency(p.cur) ? priceText(p.cur) ?? null : null, windowDays: PAYMENT_WINDOW_DAYS });
        return;
      }
      res.json(base);
    })
  );

  // The "send the questionnaire" button in the fit-check email. The first visit only shows a page; the questionnaire is sent when the button on that page is pressed, so a mail
  // scanner that opens the link cannot send it by accident.
  router.get(
    '/approve',
    readLimit,
    validate({ query: { t: { type: 'string', required: true, maxLength: 2000 }, confirm: { type: 'string', required: false, maxLength: 2 } }, allowOnlyQuery: ['t', 'confirm'] }),
    asyncHandler(async (req: any, res: any) => {
      res.set('Cache-Control', 'no-store');
      res.set('X-Robots-Tag', 'noindex');
      const checked = checkToken(req.query.t, 'approve');
      if (!checked.ok) {
        res.status(checked.status).type('html').send(page('This link does not work', `<p>${escapeHtml(String(checked.error))}</p>`));
        return;
      }
      const p = checked.payload as LinkPayload;
      const who = `${escapeHtml(p.company)} (${escapeHtml(p.email)})`;
      if (req.query.confirm !== '1') {
        const price = isAuditCurrency(p.cur) ? auditPrices()[p.cur] : undefined;
        const href = `${req.originalUrl.split('?')[0]}?t=${encodeURIComponent(String(req.query.t))}&confirm=1`;
        res.type('html').send(page('Send the audit questionnaire?',
          `<p>This emails <b>${who}</b> a private link to the audit questionnaire.</p>` +
          `<p style="color:#5b6472">After they submit it, the AI drafts the audit and you get an email with a link to review it. When you approve the draft, the client is emailed the payment link${isAuditCurrency(p.cur) && price !== undefined ? ` for ${escapeHtml(priceText(p.cur) ?? '')}` : ' (no payment currency is set for this country, so you will send that one yourself)'}. The full audit goes out once they pay.</p>` +
          `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#1b1f27;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Send the questionnaire</a></p>`));
        return;
      }
      if (approvedIds.has(p.id)) {
        res.type('html').send(page('Already sent', `<p>The questionnaire was already sent to <b>${who}</b>.</p>`));
        return;
      }
      const link = questionnaireUrl({ id: p.id, company: p.company, email: p.email, name: p.name, cur: p.cur });
      if (!link) {
        res.status(503).type('html').send(page('Not set up', '<p>AUDIT_LINK_SECRET is not set on the server, so links cannot be made. Use the command-line script instead.</p>'));
        return;
      }
      const fee = isAuditCurrency(p.cur) ? priceText(p.cur) : undefined;
      try {
        const sent = await sendClientAuditMail({
          to: p.email,
          eyebrow: 'Opportunity Audit',
          title: 'Your audit questionnaire',
          subject: `Your Opportunity Audit questionnaire, ${p.company}`,
          preheader: 'The next step: tell us how your business runs today.',
          bodyHtml:
            para(`Hi ${escapeHtml(p.name || 'there')},`) +
            para(`Thank you for completing the fit check for ${escapeHtml(p.company)}. We would like to proceed with the Opportunity Audit.`) +
            para('The next step is a questionnaire about your business, your current processes and your systems. Your answers are saved on this device as you type, so you can return to it at any time.') +
            para(`Once you submit it, we will prepare your audit, which takes about one week. We will then send you a payment link for the audit fee${fee ? ` (${escapeHtml(fee)})` : ''}, and you receive the full audit once the payment is made.`) +
            para('If you would like an NDA signed first, please reply to this email.'),
          ctaLabel: 'Open the questionnaire',
          ctaUrl: link,
        });
        if (sent === 'not-configured') {
          res.status(503).type('html').send(page('Email is not set up', '<p>RESEND_API_KEY is not set on the server, so the email could not be sent.</p>'));
          return;
        }
      } catch (error) {
        logger.error('[Audit] Failed to send the questionnaire email', undefined, error instanceof Error ? error : new Error(String(error)));
        res.status(502).type('html').send(page('Could not send', '<p>The email did not go out. Please try the button again, or send the link by hand with the script.</p>'));
        return;
      }
      approvedIds.add(p.id);
      void import('../db/pool.js').then((m) => markLeadStatusSafe(m.pool, p.email, 'form_sent')).catch(() => undefined);
      res.type('html').send(page('Sent', `<p>The questionnaire link was emailed to <b>${who}</b>. It works for ${QUESTIONNAIRE_DAYS} days.</p>`));
    })
  );

  // The "audit is ready, send the payment link" button in the "questionnaire received" email for us. Same safety as the approve page: the first visit only shows a page, and the
  // email goes out when its button is pressed, once.
  router.get(
    '/send-payment',
    readLimit,
    validate({ query: { t: { type: 'string', required: true, maxLength: 2000 }, confirm: { type: 'string', required: false, maxLength: 2 } }, allowOnlyQuery: ['t', 'confirm'] }),
    asyncHandler(async (req: any, res: any) => {
      res.set('Cache-Control', 'no-store');
      res.set('X-Robots-Tag', 'noindex');
      const checked = checkToken(req.query.t, 'sendpay');
      if (!checked.ok) {
        res.status(checked.status).type('html').send(page('This link does not work', `<p>${escapeHtml(String(checked.error))}</p>`));
        return;
      }
      const p = checked.payload as LinkPayload;
      const who = `${escapeHtml(p.company)} (${escapeHtml(p.email)})`;
      const fee = isAuditCurrency(p.cur) ? priceText(p.cur) : undefined;
      if (!fee) {
        res.type('html').send(page('No payment currency', `<p>There is no audit price for ${who}'s currency, so the payment link cannot be made here. Send it by hand with apps/gateway/scripts/create-audit-link.ts.</p>`));
        return;
      }
      if (req.query.confirm !== '1') {
        const href = `${req.originalUrl.split('?')[0]}?t=${encodeURIComponent(String(req.query.t))}&confirm=1`;
        res.type('html').send(page('Is the audit ready?',
          `<p>This emails <b>${who}</b> a payment link for <b>${escapeHtml(fee)}</b>. Only do this once the audit report is finished and ready to send.</p>` +
          `<p style="color:#5b6472">The client pays, then you send them the full audit. The payment link works for ${PAYMENT_WINDOW_DAYS} days.</p>` +
          `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#1b1f27;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Send the payment link</a></p>`));
        return;
      }
      if (paymentSentIds.has(p.id)) {
        res.type('html').send(page('Already sent', `<p>The payment link was already sent to <b>${who}</b>.</p>`));
        return;
      }
      const link = paymentUrl({ id: p.id, company: p.company, email: p.email, name: p.name, cur: p.cur });
      if (!link) {
        res.status(503).type('html').send(page('Not set up', '<p>AUDIT_LINK_SECRET is not set on the server, so links cannot be made. Use the command-line script instead.</p>'));
        return;
      }
      try {
        const sent = await sendClientAuditMail({
          to: p.email,
          eyebrow: 'Opportunity Audit',
          title: 'Your audit is ready',
          subject: `Your Opportunity Audit is ready, ${p.company}`,
          preheader: 'Pay the audit fee to receive your audit.',
          bodyHtml:
            para(`Hi ${escapeHtml(p.name || 'there')},`) +
            para(`Your Opportunity Audit for ${escapeHtml(p.company)} is ready. To receive it, please pay the audit fee (${escapeHtml(fee)}) using the secure link below within ${PAYMENT_WINDOW_DAYS} days.`) +
            para('We will send you the full audit by email as soon as your payment arrives. The audit fee is separate from any build, and it is not refundable once the audit has been delivered.'),
          ctaLabel: 'Pay the audit fee',
          ctaUrl: link,
        });
        if (sent === 'not-configured') {
          res.status(503).type('html').send(page('Email is not set up', '<p>RESEND_API_KEY is not set on the server, so the email could not be sent.</p>'));
          return;
        }
      } catch (error) {
        logger.error('[Audit] Failed to send the payment link email', undefined, error instanceof Error ? error : new Error(String(error)));
        res.status(502).type('html').send(page('Could not send', '<p>The email did not go out. Please try the button again, or send the link by hand with the script.</p>'));
        return;
      }
      paymentSentIds.add(p.id);
      res.type('html').send(page('Sent', `<p>The payment link was emailed to <b>${who}</b>. It works for ${PAYMENT_WINDOW_DAYS} days. You will get an "Audit PAID" email when they pay.</p>`));
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
      if (!answers.a_company || !answers.b_process) {
        res.status(400).json({ error: 'Please tell us about your company, and describe how the process is handled today.' });
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
        return rows.length ? renderDetailList(rows, section.title) : '';
      }).join('');
      const answered = Object.keys(answers).length;
      const intro =
        renderCallout({ tone: 'warn', label: 'Next step', headline: 'A draft audit is being written from these answers. You will get a second email in a few minutes with a link to review it.', points: ['Both of you can read and edit the draft there, then approve it. Approving emails the client the payment link.', 'If the draft fails or the link does not arrive, you will get an email with a button to carry on by hand.'] })
        + renderSummaryStrip([
          { label: 'Company', value: p.company },
          { label: 'Answered', value: `${answered} of ${AUDIT_QUESTIONS.length}` },
          { label: 'Contact', value: p.email },
          { label: 'Reference', value: p.id },
        ]);

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
      // A plain thank-you, so the client knows what happens next. The payment link comes later, once the audit is ready.
      try {
        await sendClientAuditMail({
          to: p.email,
          eyebrow: 'Opportunity Audit',
          title: 'Thank you, we have your answers',
          subject: `We received your questionnaire, ${p.company}`,
          preheader: 'We will prepare your audit and email you when it is ready.',
          bodyHtml:
            para(`Hi ${escapeHtml(p.name || 'there')},`) +
            para(`Thank you for completing the questionnaire for ${escapeHtml(p.company)}.`) +
            para('We will now prepare your Opportunity Audit, which takes about one week. When it is ready, we will email you a payment link for the audit fee, and you receive the full audit once the payment is made.'),
        });
      } catch (error) {
        logger.error('[Audit] Failed to send the questionnaire confirmation', undefined, error instanceof Error ? error : new Error(String(error)));
      }
      // Write the draft audit in the background. The client gets their answer now; the team gets the review email when the draft is ready.
      void startDraft(p, answers).catch((error) => logger.error('[Audit] Draft step crashed', undefined, error instanceof Error ? error : new Error(String(error))));
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
          bodyHtml: renderCallout({ tone: 'good', label: 'Payment received', headline: 'Deliver the audit to the client.' }) + renderSummaryStrip([{ label: 'Paid', value: paid }, { label: 'Company', value: session.metadata.company ?? '—' }]) + renderDetailList(rows, 'Payment details'),
          replyTo: session.customer_details?.email ?? undefined,
        });
      } catch (error) {
        logger.error('[Audit] Paid notification failed', undefined, error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({ error: 'Could not send the notification' }); // Stripe retries, so the notification is not lost
        return;
      }
      // If the team approved the report, this sends the PDF to the client right now; if not, the team is told to approve it.
      let delivered = false;
      if (session.metadata.link_id) {
        try {
          delivered = (await handlePaid(session.metadata.link_id)) === 'delivered';
        } catch (error) {
          logger.error('[Audit] Automatic delivery step crashed', undefined, error instanceof Error ? error : new Error(String(error)));
        }
      }
      const clientEmail = session.customer_details?.email ?? session.customer_email;
      if (clientEmail && !delivered) {
        try {
          await sendClientAuditMail({
            to: clientEmail,
            eyebrow: 'Opportunity Audit',
            title: 'Payment received',
            subject: 'We received your payment',
            preheader: 'We will send you your audit shortly.',
            bodyHtml:
              para('Thank you. We received your payment for the Opportunity Audit' + (session.metadata.company ? ` for ${escapeHtml(session.metadata.company)}` : '') + '.') +
              para('We will email your full audit to this address within one business day. If you have any questions in the meantime, please reply to this email.'),
          });
        } catch (error) {
          logger.error('[Audit] Payment confirmation to the client failed', undefined, error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }
  // Support plans (consultancy): activation, failed and recovered payments, cancellation. Does nothing for events that are not about a support plan.
  try {
    await handleSupportEvent(event);
  } catch (error) {
    logger.error('[Support] Webhook handling failed', undefined, error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({ error: 'Could not record the support event' }); // Stripe retries
    return;
  }
  res.json({ received: true });
}
