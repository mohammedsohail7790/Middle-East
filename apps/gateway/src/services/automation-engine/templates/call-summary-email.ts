import type { AutomationTemplate } from '../types.js';

/** Saves about 2 minutes per call: reading the dashboard to find out who called and what they wanted. */
export const callSummaryEmail: AutomationTemplate = {
  key: 'call-summary-email',
  name: 'Email me a summary after every call',
  description:
    'After each call you get an email with who called, their number, how it ended and a short summary. This sends email outside Halla AI, so in "ask first" mode each one waits for your yes; in automatic mode it is sent by itself.',
  trigger: 'call.ended',
  needs: ['A phone number connected to Halla AI'],
  minutesSavedPerRun: 2,
  steps: [
    {
      key: 'email-owner', kind: 'email.send', title: 'Email you the call summary', external: true,
      params: {
        to: '{{config.ownerEmail}}',
        subject: 'Call summary: {{trigger.callerName}} ({{trigger.callerPhone}})',
        body: 'Caller: {{trigger.callerName}}\nPhone: {{trigger.callerPhone}}\nOutcome: {{trigger.outcome}}\n\n{{trigger.summary}}',
      },
    },
  ],
  config: [
    { key: 'ownerEmail', label: 'Your email address', type: 'email', required: true, help: 'Where the call summary is sent.' },
  ],
};
