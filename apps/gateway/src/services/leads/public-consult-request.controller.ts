import { Router } from 'express';
import { asyncHandler, MiddlewareFactory } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import { logger } from '../logger.js';
import { renderBrandedEmail, renderCallout, renderDetailList, renderQuote, renderSummaryStrip, stripToPlainText } from '../automation/email-template.js';
import { Resend } from 'resend';
import { throwIfRejected } from '../email-delivery.js';

// Public, unauthenticated endpoint — throttle per IP to prevent spam/cost-exhaustion abuse.
const consultRequestRateLimit = MiddlewareFactory.createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many requests. Please try again later or email hello@hallaai.com directly.',
});

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const LEAD_NOTIFICATION_TO = process.env.CONSULT_LEAD_EMAIL || 'hello@hallaai.com';

const consultRequestBodySchema = {
  body: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 200 },
    email: { type: 'email', required: true },
    phone: { type: 'string', required: false, maxLength: 40 },
    business: { type: 'string', required: false, maxLength: 200 },
    priority: { type: 'string', required: false, maxLength: 200 },
    notes: { type: 'string', required: false, maxLength: 2000 },
  },
  allowOnlyBody: ['name', 'email', 'phone', 'business', 'priority', 'notes'],
};

/**
 * Public (unauthenticated) endpoint for the Halla AI Consultancy marketing
 * site's "Book a Diagnostic Call" form. No tenant context exists yet — this
 * is a pre-signup lead, so the only side effect is an email notification.
 */
export function createPublicConsultRequestRouter(): Router {
  const router = Router();

  router.post(
    '/',
    consultRequestRateLimit,
    validate(consultRequestBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const { name, email, phone, business, priority, notes } = req.body as {
        name: string;
        email: string;
        phone?: string;
        business?: string;
        priority?: string;
        notes?: string;
      };

      if (!resend) {
        logger.error('[ConsultRequest] RESEND_API_KEY not configured — cannot deliver lead');
        res.status(503).json({
          error: 'Email delivery is not configured. Please email hello@hallaai.com directly.',
        });
        return;
      }

      // The website's Contact page posts here too, marking itself with a "General enquiry" priority.
      const isContactMessage = typeof priority === 'string' && priority.startsWith('General enquiry');

      const contactRows = [
        { label: 'Name', value: name },
        { label: 'Email', value: email },
        { label: 'Phone', value: phone || '—' },
        { label: 'Business', value: business || '—' },
      ];
      const headline = isContactMessage ? 'A visitor sent a message from the website' : 'A visitor asked for a free diagnostic call';
      const bodyHtml =
        renderCallout({ tone: 'info', label: isContactMessage ? 'Contact page' : 'Diagnostic call', headline, points: ['Reply within one working day.'] })
        + (isContactMessage ? '' : renderSummaryStrip([
          { label: 'Business', value: business || 'Not given' },
          { label: 'Main priority', value: priority || 'Not given' },
          { label: 'Phone', value: phone || 'Not given' },
        ]))
        + (notes ? renderQuote(isContactMessage ? 'Their message' : 'What they told us', notes) : '')
        + renderDetailList(contactRows, 'Contact details');

      const html = renderBrandedEmail({
        eyebrow: isContactMessage ? 'New contact message' : 'New diagnostic call request',
        title: isContactMessage
          ? `${name} sent a message`
          : business ? `${business} wants a diagnostic call` : `${name} wants a diagnostic call`,
        preheader: `${name}, ${email}${business ? `, ${business}` : ''}`,
        bodyHtml,
        ctaLabel: `Reply to ${name.split(/\s+/)[0]}`,
        ctaUrl: `mailto:${encodeURIComponent(email)}`,
      });

      try {
        throwIfRejected(await resend.emails.send({
          from: `Halla AI <${process.env.EMAIL_FROM || 'noreply@hallaai.com'}>`,
          to: LEAD_NOTIFICATION_TO,
          replyTo: email,
          subject: isContactMessage ? `New Contact Message — ${name}` : `New Diagnostic Call Request — ${business || name}`,
          html,
          text: stripToPlainText(html),
        }));
      } catch (error) {
        logger.error(
          '[ConsultRequest] Failed to send lead notification email',
          undefined,
          error instanceof Error ? error : new Error(String(error))
        );
        res.status(502).json({ error: 'Could not deliver your request. Please email hello@hallaai.com directly.' });
        return;
      }

      res.status(200).json({ ok: true });
    })
  );

  return router;
}
