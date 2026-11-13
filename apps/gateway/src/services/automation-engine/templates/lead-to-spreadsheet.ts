import type { AutomationTemplate } from '../types.js';

/** Saves about 2 minutes: copying a lead's six details into a sheet by hand is a short but easily forgotten job. */
export const leadToSpreadsheet: AutomationTemplate = {
  key: 'lead-to-spreadsheet',
  name: 'Add every new lead to my spreadsheet',
  description:
    'Each new lead is sent to your Zapier or Google Sheets web address as one row: name, phone, email, source, score and time. This sends data outside Halla AI, so in "ask first" mode it waits for your yes; in automatic mode it runs by itself.',
  trigger: 'lead.created',
  needs: ['A Zapier or Google Sheets web address (webhook)'],
  minutesSavedPerRun: 2,
  steps: [
    {
      key: 'send-to-sheet', kind: 'webhook.post', title: 'Send the lead to your spreadsheet', external: true,
      params: {
        url: '{{config.webhookUrl}}',
        body: { name: '{{trigger.name}}', phone: '{{trigger.phone}}', email: '{{trigger.email}}', source: '{{trigger.source}}', score: '{{trigger.score}}', time: '{{trigger.createdAt}}' },
      },
    },
  ],
  config: [
    { key: 'webhookUrl', label: 'Spreadsheet web address', type: 'url', required: true, help: 'In Zapier choose "Webhooks by Zapier", then "Catch Hook", and paste the address it gives you. It must start with https://.' },
  ],
};
