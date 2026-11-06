import { Router } from 'express';
import { asyncHandler, MiddlewareFactory } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import { logger } from '../logger.js';
import { renderBrandedEmail, renderCallout, renderDetailList, renderQuote, renderSummaryStrip, stripToPlainText, type CalloutTone } from '../automation/email-template.js';
import { Resend } from 'resend';
import { throwIfRejected } from '../email-delivery.js';
import { assessFit, parseDataLocations, BUDGET_ANSWERS, COMPANY_SIZES, COMPLIANCE_ANSWERS, COUNTRIES, DECIDER_ANSWERS, HOURS_ANSWERS, OFFICE_SIZES, QUOTE_CURRENCY, START_ANSWERS, VERDICT_LABEL, type FitInput } from './fit-check.js';

// Public, unauthenticated endpoint: throttle per IP, like the diagnostic-call form.
const fitCheckRateLimit = MiddlewareFactory.createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many requests. Please try again later or email hello@hallaai.com directly.',
});

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// Who receives a fit check. FIT_CHECK_LEAD_EMAILS takes one or more addresses separated by commas (so Hk and the owner both get it); without it the diagnostic-call address is used.
const LEAD_NOTIFICATION_TO = (process.env.FIT_CHECK_LEAD_EMAILS || process.env.CONSULT_LEAD_EMAIL || 'hello@hallaai.com')
  .split(',')
  .map((address) => address.trim())
  .filter((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address));

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
    office: { type: 'string', required: false, enum: [...OFFICE_SIZES], maxLength: 10 },
    departments: { type: 'string', required: false, maxLength: 400 },
    industry: { type: 'string', required: true, minLength: 1, maxLength: 100 },
    country: { type: 'string', required: true, enum: [...COUNTRIES], maxLength: 40 },
    countryName: { type: 'string', required: false, maxLength: 80 },
    city: { type: 'string', required: false, maxLength: 100 },
    years: { type: 'string', required: false, maxLength: 30 },
    accounting: { type: 'string', required: true, minLength: 1, maxLength: 120 },
    erp: { type: 'string', required: true, minLength: 1, maxLength: 120 },
    crm: { type: 'string', required: false, maxLength: 120 },
    channels: { type: 'string', required: false, maxLength: 300 },
    tools: { type: 'string', required: false, maxLength: 300 },
    pain: { type: 'string', required: true, minLength: 1, maxLength: 300 },
    problem: { type: 'string', required: true, minLength: 1, maxLength: 2000 },
    hours: { type: 'string', required: false, enum: [...HOURS_ANSWERS], maxLength: 20 },
    painHours: { type: 'string', required: false, maxLength: 700 },
    dataLocation: { type: 'string', required: false, maxLength: 120 },
    compliance: { type: 'string', required: false, enum: [...COMPLIANCE_ANSWERS], maxLength: 20 },
    tried: { type: 'string', required: false, maxLength: 2000 },
    start: { type: 'string', required: true, enum: [...START_ANSWERS], maxLength: 20 },
    budget: { type: 'string', required: false, enum: [...BUDGET_ANSWERS], maxLength: 20 },
    heard: { type: 'string', required: false, maxLength: 200 },
    consent: { type: 'boolean', required: true },
  },
  allowOnlyBody: [
    'name', 'email', 'phone', 'role', 'decider', 'company', 'website', 'size', 'office', 'departments', 'industry', 'country', 'countryName', 'city', 'years', 'accounting', 'erp', 'crm',
    'channels', 'tools', 'pain', 'problem', 'hours', 'painHours', 'dataLocation', 'compliance', 'tried', 'start', 'budget', 'heard', 'consent',
  ],
};

type FitBody = FitInput & {
  name: string; email: string; phone?: string; role: string; company: string; website?: string; industry: string; country: (typeof COUNTRIES)[number]; countryName?: string; city?: string; years?: string;
  painHours?: string;
  accounting: string; crm?: string; channels?: string; tools?: string; tried?: string; heard?: string; consent: boolean;
};

const ROLE_LABEL: Record<string, string> = { owner: 'Owner or founder', manager: 'Manager', other: 'Other' };
const DECIDER_LABEL: Record<string, string> = { yes: 'Yes', shared: 'Decides with others', no: 'No, gathering information' };
const HOURS_LABEL: Record<string, string> = { 'under-5': 'Under 5', '5-20': '5 to 20', '20-50': '20 to 50', 'over-50': 'Over 50', unsure: 'Not sure' };
const DATA_LABEL: Record<string, string> = { structured: 'In business software (CRM, ERP or shop)', spreadsheets: 'In spreadsheets', documents: 'In emails and digital documents', paper: 'On paper or in manual files', unsure: 'Not sure' };
const COMPLIANCE_LABEL: Record<string, string> = { 'cloud-ok': 'No strict requirements (standard cloud is fine)', 'local-hosting': 'Must be hosted in the UAE/GCC', unsure: 'Not sure' };
const START_LABEL: Record<string, string> = { 'this-month': 'This month', '1-3-months': 'In 1 to 3 months', later: 'Later', exploring: 'Just exploring' };
const BUDGET_LABEL: Record<string, string> = { 'under-5000': 'Under 5,000 AED', '5000-15000': '5,000 to 15,000 AED', '15000-60000': '15,000 to 60,000 AED', 'over-60000': 'Over 60,000 AED', unsure: 'Not sure yet' };

/**
 * Public (unauthenticated) endpoint for "Form 1", the short fit check on the Consultancy site (the second form is the paid audit questionnaire). No account exists yet; the only side effect is an email to us whose first lines
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

      if (b.dataLocation && parseDataLocations(b.dataLocation) === null) {
        res.status(400).json({ error: 'Invalid answer for where the information lives.' });
        return;
      }

      const fit = assessFit(b);
      const country = `${b.country === 'Other' && b.countryName ? b.countryName : b.country}${b.city ? `, ${b.city}` : ''}`;
      const sections: Array<{ heading: string; rows: Array<{ label: string; value: string }> }> = [
        {
          heading: 'Contact',
          rows: [
            { label: 'Name', value: b.name },
            { label: 'Email', value: b.email },
            { label: 'Phone', value: b.phone || '—' },
            { label: 'Role', value: ROLE_LABEL[b.role] ?? b.role },
            { label: 'Decides?', value: DECIDER_LABEL[b.decider] ?? b.decider },
          ],
        },
        {
          heading: 'Company',
          rows: [
            { label: 'Company', value: b.company },
            { label: 'Website', value: b.website || '—' },
            { label: 'Industry', value: b.industry },
            { label: 'Country', value: country },
            { label: 'Quote in', value: QUOTE_CURRENCY[b.country] },
            { label: 'People', value: b.office ? `${b.size} (${b.office} in the office or deciding)` : b.size },
            { label: 'Departments', value: b.departments || '—' },
            { label: 'Years operating', value: b.years || '—' },
          ],
        },
        {
          heading: 'Systems and data',
          rows: [
            { label: 'Accounting', value: b.accounting },
            { label: 'ERP', value: b.erp },
            { label: 'CRM', value: b.crm || '—' },
            { label: 'Channels', value: b.channels || '—' },
            { label: 'Other tools', value: b.tools || '—' },
            { label: 'Where the data lives', value: b.dataLocation ? (parseDataLocations(b.dataLocation) ?? []).map((p) => DATA_LABEL[p] ?? p).join('; ') || '—' : '—' },
            { label: 'Data or hosting rules', value: b.compliance ? COMPLIANCE_LABEL[b.compliance] ?? b.compliance : '—' },
          ],
        },
        {
          heading: 'The problem',
          rows: [
            { label: 'Biggest drain', value: b.pain },
            { label: 'Hours a week', value: b.hours ? HOURS_LABEL[b.hours] ?? b.hours : '—' },
            { label: 'Hours by area', value: b.painHours || '—' },
            { label: 'Tried before', value: b.tried || '—' },
          ],
        },
        {
          heading: 'Timing and budget',
          rows: [
            { label: 'Start', value: START_LABEL[b.start] ?? b.start },
            { label: 'Budget', value: b.budget ? BUDGET_LABEL[b.budget] ?? b.budget : '—' },
            { label: 'Heard about us', value: b.heard || '—' },
          ],
        },
      ];

      const VERDICT_TONE: Record<typeof fit.verdict, CalloutTone> = { green: 'good', amber: 'warn', red: 'bad' };
      const verdictHtml = renderCallout({ tone: VERDICT_TONE[fit.verdict], label: 'First read', headline: VERDICT_LABEL[fit.verdict], points: fit.reasons });

      const html = renderBrandedEmail({
        eyebrow: `New fit check · ${fit.verdict.toUpperCase()}`,
        title: `${b.company} filled in the fit check`,
        preheader: `${VERDICT_LABEL[fit.verdict]} ${b.name}, ${country}.`,
        bodyHtml: verdictHtml
          + renderSummaryStrip([
            { label: 'Country', value: country },
            { label: 'Team size', value: b.size },
            { label: 'Start', value: START_LABEL[b.start] ?? b.start },
            { label: 'Budget', value: b.budget ? BUDGET_LABEL[b.budget] ?? b.budget : 'Not given' },
          ])
          + renderQuote('The problem, in their words', b.problem)
          + sections.map((section) => renderDetailList(section.rows, section.heading)).join(''),
        ctaLabel: `Reply to ${b.name.split(/\s+/)[0]}`,
        ctaUrl: `mailto:${encodeURIComponent(b.email)}`,
      });

      try {
        throwIfRejected(await resend.emails.send({
          from: `Halla AI <${process.env.EMAIL_FROM || 'noreply@hallaai.com'}>`,
          to: LEAD_NOTIFICATION_TO,
          replyTo: b.email,
          subject: `New Fit Check — ${fit.verdict.toUpperCase()} — ${b.company}`,
          html,
          text: stripToPlainText(html),
        }));
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
