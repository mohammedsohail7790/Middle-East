import { Router } from 'express';
import { asyncHandler, MiddlewareFactory } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import { logger } from '../logger.js';
import { escapeHtml, renderBrandedEmail, renderDetailList, stripToPlainText } from '../automation/email-template.js';
import { Resend } from 'resend';
import { assessFit, BUDGET_ANSWERS, COMPANY_SIZES, DECIDER_ANSWERS, HOURS_ANSWERS, START_ANSWERS, VERDICT_LABEL, type FitInput } from './fit-check.js';

// Public, unauthenticated endpoint: throttle per IP, like the diagnostic-call form.
const fitCheckRateLimit = MiddlewareFactory.createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many requests. Please try again later or email hello@hallaai.com directly.',
});

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const LEAD_NOTIFICATION_TO = process.env.CONSULT_LEAD_EMAIL || 'hello@hallaai.com';

const fitCheckBodySchema = {
  body: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 200 },
    email: { type: 'email', required: true, maxLength: 254 },
    phone: { type: 'string', required: false, maxLength: 40 },
    role: { type: 'string', required: true, enum: ['owner', 'manager', 'other'], maxLength: 20 },
    decider: { type: 'string', required: true, enum: [...DECIDER_ANSWERS], maxLength: 20 },
    company: { type: 'string', required: true, minLength: 1, maxLength: 200 },
    website: { type: 'string', required: false, maxLength: 300 },
    size: { type: 'string', required: true, enum: [...COMPANY_SIZES], maxLength: 10 },
    industry: { type: 'string', required: true, minLength: 1, maxLength: 100 },
    location: { type: 'string', required: true, minLength: 1, maxLength: 200 },
    years: { type: 'string', required: false, maxLength: 30 },
    accounting: { type: 'string', required: true, minLength: 1, maxLength: 120 },
    erp: { type: 'string', required: true, minLength: 1, maxLength: 120 },
    crm: { type: 'string', required: false, maxLength: 120 },
    channels: { type: 'string', required: false, maxLength: 300 },
    tools: { type: 'string', required: false, maxLength: 300 },
    pain: { type: 'string', required: true, minLength: 1, maxLength: 300 },
    problem: { type: 'string', required: true, minLength: 1, maxLength: 2000 },
    hours: { type: 'string', required: false, enum: [...HOURS_ANSWERS], maxLength: 20 },
    tried: { type: 'string', required: false, maxLength: 2000 },
    start: { type: 'string', required: true, enum: [...START_ANSWERS], maxLength: 20 },
    budget: { type: 'string', required: false, enum: [...BUDGET_ANSWERS], maxLength: 20 },
    heard: { type: 'string', required: false, maxLength: 200 },
    consent: { type: 'boolean', required: true },
  },
  allowOnlyBody: [
    'name', 'email', 'phone', 'role', 'decider', 'company', 'website', 'size', 'industry', 'location', 'years', 'accounting', 'erp', 'crm',
    'channels', 'tools', 'pain', 'problem', 'hours', 'tried', 'start', 'budget', 'heard', 'consent',
  ],
};

type FitBody = FitInput & {
  name: string; email: string; phone?: string; role: string; company: string; website?: string; industry: string; location: string; years?: string;
  accounting: string; crm?: string; channels?: string; tools?: string; tried?: string; heard?: string; consent: boolean;
};

const ROLE_LABEL: Record<string, string> = { owner: 'Owner or founder', manager: 'Manager', other: 'Other' };
const DECIDER_LABEL: Record<string, string> = { yes: 'Yes', shared: 'Decides with others', no: 'No, gathering information' };
const HOURS_LABEL: Record<string, string> = { 'under-5': 'Under 5', '5-20': '5 to 20', '20-50': '20 to 50', 'over-50': 'Over 50', unsure: 'Not sure' };
const START_LABEL: Record<string, string> = { 'this-month': 'This month', '1-3-months': 'In 1 to 3 months', later: 'Later', exploring: 'Just exploring' };
const BUDGET_LABEL: Record<string, string> = { 'under-2500': 'Under 2,500 USD', '2500-10000': '2,500 to 10,000 USD', '10000-30000': '10,000 to 30,000 USD', 'over-30000': 'Over 30,000 USD', unsure: 'Not sure yet' };

/**
 * Public (unauthenticated) endpoint for "Form 1", the short fit check on the Consultancy site. No account exists yet; the only side effect is an email to us whose first lines
 * say whether the company looks like a fit (see fit-check.ts). Nothing is sent to the prospect, and the verdict never blocks a request.
 */
export function createPublicFitCheckRouter(): Router {
  const router = Router();

  router.post(
    '/',
    fitCheckRateLimit,
    validate(fitCheckBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const b = req.body as FitBody;

      if (b.consent !== true) {
        res.status(400).json({ error: 'Please agree to us storing your answers and contacting you.' });
        return;
      }

      if (!resend) {
        logger.error('[FitCheck] RESEND_API_KEY not configured, cannot deliver request');
        res.status(503).json({ error: 'Email delivery is not configured. Please email hello@hallaai.com directly.' });
        return;
      }

      const fit = assessFit(b);
      const rows = [
        { label: 'Name', value: b.name },
        { label: 'Email', value: b.email },
        { label: 'Phone', value: b.phone || '—' },
        { label: 'Role', value: ROLE_LABEL[b.role] ?? b.role },
        { label: 'Decides?', value: DECIDER_LABEL[b.decider] ?? b.decider },
        { label: 'Company', value: b.company },
        { label: 'Website', value: b.website || '—' },
        { label: 'People', value: b.size },
        { label: 'Industry', value: b.industry },
        { label: 'Location', value: b.location },
        { label: 'Years operating', value: b.years || '—' },
        { label: 'Accounting', value: b.accounting },
        { label: 'ERP', value: b.erp },
        { label: 'CRM', value: b.crm || '—' },
        { label: 'Channels', value: b.channels || '—' },
        { label: 'Other tools', value: b.tools || '—' },
        { label: 'Biggest drain', value: b.pain },
        { label: 'The problem', value: b.problem },
        { label: 'Hours a week', value: b.hours ? HOURS_LABEL[b.hours] ?? b.hours : '—' },
        { label: 'Tried before', value: b.tried || '—' },
        { label: 'Start', value: START_LABEL[b.start] ?? b.start },
        { label: 'Budget', value: b.budget ? BUDGET_LABEL[b.budget] ?? b.budget : '—' },
        { label: 'Heard about us', value: b.heard || '—' },
      ];

      const reasonsHtml = `<ul style="margin: 8px 0 0; padding-left: 18px;">${fit.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
      const verdictHtml = `<p style="margin: 0 0 4px; font-size: 16px; font-weight: 700;">${escapeHtml(VERDICT_LABEL[fit.verdict])}</p>${fit.outOfScope ? '<p style="margin: 0 0 4px;"><b>Out of scope:</b> more than 50 people.</p>' : ''}${reasonsHtml}`;

      const html = renderBrandedEmail({
        eyebrow: `Fit check: ${fit.verdict.toUpperCase()}`,
        title: `${b.company} filled in the fit check`,
        bodyHtml: verdictHtml + renderDetailList(rows),
        ctaLabel: 'Reply',
        ctaUrl: `mailto:${encodeURIComponent(b.email)}`,
      });

      try {
        await resend.emails.send({
          from: `Halla AI <${process.env.EMAIL_FROM || 'noreply@hallaai.com'}>`,
          to: LEAD_NOTIFICATION_TO,
          replyTo: b.email,
          subject: `New Fit Check — ${fit.verdict.toUpperCase()}${fit.outOfScope ? ' (over 50 people)' : ''} — ${b.company}`,
          html,
          text: stripToPlainText(html),
        });
      } catch (error) {
        logger.error('[FitCheck] Failed to send request email', undefined, error instanceof Error ? error : new Error(String(error)));
        res.status(502).json({ error: 'Could not deliver your request. Please email hello@hallaai.com directly.' });
        return;
      }

      res.status(200).json({ ok: true });
    })
  );

  return router;
}
