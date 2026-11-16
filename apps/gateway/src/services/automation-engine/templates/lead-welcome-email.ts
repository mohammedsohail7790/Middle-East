import type { AutomationTemplate } from '../types.js';

/** Saves about 2 minutes: sending a quick "thanks, we will be in touch" to each new enquiry. */
export const leadWelcomeEmail: AutomationTemplate = {
  key: 'lead-welcome-email',
  name: 'Send new leads a thank-you email',
  description:
    'Each new lead who left an email address gets a short thank-you from you straight away. Leads without an email are skipped. This writes to your customer, so in "ask first" mode each email waits for your yes; in automatic mode it is sent by itself.',
  trigger: 'lead.created',
  needs: ['Leads captured by Halla AI or a form'],
  minutesSavedPerRun: 2,
  steps: [
    {
      key: 'email-lead', kind: 'email.send', title: 'Email the lead a thank-you', external: true,
      params: {
        to: 'customer',
        subject: 'Thanks for getting in touch with {{config.businessName}}',
        body: 'Hello {{trigger.name}},\n\nThank you for contacting {{config.businessName}}. {{config.message}}\n\nIf anything is urgent, please call us.',
      },
    },
  ],
  config: [
    { key: 'businessName', label: 'Your business name', type: 'text', required: true, help: 'Shown in the email so the lead knows who it is from.' },
    { key: 'message', label: 'What you want to tell them', type: 'text', default: 'A member of our team will contact you shortly.', help: 'One or two sentences, for example when they can expect to hear from you.' },
  ],
};
