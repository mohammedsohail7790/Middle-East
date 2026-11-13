import type { AutomationTemplate } from '../types.js';

/** Saves about 3 minutes: typing a lead's details into the CRM by hand takes 2 to 3 minutes, plus a moment to tell the team. Kept low on purpose. */
export const leadToCrm: AutomationTemplate = {
  key: 'lead-to-crm',
  name: 'Add every new lead to my CRM',
  description:
    'Each time the receptionist or a form captures a new lead, it is added to your connected CRM and your team is told. Both steps change things outside Halla AI, so in "ask first" mode each one waits for your yes; in automatic mode they run by themselves.',
  trigger: 'lead.created',
  needs: ['A connected CRM'],
  minutesSavedPerRun: 3,
  steps: [
    {
      key: 'push-to-crm', kind: 'crm.push_lead', title: 'Add the lead to your CRM', external: true,
      params: { name: '{{trigger.name}}', phone: '{{trigger.phone}}', email: '{{trigger.email}}', source: '{{trigger.source}}', score: '{{trigger.score}}', tag: '{{config.crmTag}}' },
    },
    {
      key: 'tell-team', kind: 'notify.team', title: 'Tell your team about the new lead', external: true,
      params: { title: 'New lead: {{trigger.name}}', message: 'A new lead was added to your CRM. Phone: {{trigger.phone}}. Email: {{trigger.email}}. Source: {{trigger.source}}.' },
    },
  ],
  config: [
    { key: 'crmTag', label: 'Tag to put on these leads', type: 'text', default: 'Halla AI', help: 'A label added to every lead so you can find the ones Halla AI brought in. You can leave it as it is.' },
  ],
};
