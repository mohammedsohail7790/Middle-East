import { Router } from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import { logger } from '../logger.js';
import { renderBrandedEmail, renderDetailList, stripToPlainText } from '../automation/email-template.js';
import { Resend } from 'resend';

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

      const rows = [
        { label: 'Name', value: name },
        { label: 'Email', value: email },
        { label: 'Phone', value: phone || '—' },
        { label: 'Business', value: business || '—' },
        { label: 'Priority', value: priority || '—' },
        { label: 'Notes', value: notes || '—' },
      ];

      const html = renderBrandedEmail({
        eyebrow: 'New Diagnostic Call Request',
        title: business ? `${business} wants a diagnostic call` : `${name} wants a diagnostic call`,
        bodyHtml: renderDetailList(rows),
        ctaLabel: 'Reply to lead',
        ctaUrl: `mailto:${email}`,
      });

      try {
        await resend.emails.send({
          from: `Halla AI <${process.env.EMAIL_FROM || 'noreply@hallaai.com'}>`,
          to: LEAD_NOTIFICATION_TO,
          replyTo: email,
          subject: `New Diagnostic Call Request — ${business || name}`,
          html,
          text: stripToPlainText(html),
        });
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
