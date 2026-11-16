import type { AutomationTemplate } from '../types.js';

/** Saves about 2 minutes per call: logging each call by hand. */
export const callLogToSpreadsheet: AutomationTemplate = {
  key: 'call-log-to-spreadsheet',
  name: 'Add every call to my spreadsheet',
  description:
    'After each call, one row goes to your Zapier or Google Sheets web address: caller, phone, score, outcome and summary. This sends data outside Halla AI, so in "ask first" mode it waits for your yes; in automatic mode it runs by itself.',
  trigger: 'call.ended',
  needs: ['A Zapier or Google Sheets web address (webhook)'],
  minutesSavedPerRun: 2,
  steps: [
    {
      key: 'send-to-sheet', kind: 'webhook.post', title: 'Send the call to your spreadsheet', external: true,
      params: {
        url: '{{config.webhookUrl}}',
        body: { caller: '{{trigger.callerName}}', phone: '{{trigger.callerPhone}}', score: '{{trigger.score}}', outcome: '{{trigger.outcome}}', summary: '{{trigger.summary}}' },
      },
    },
  ],
  config: [
    { key: 'webhookUrl', label: 'Spreadsheet web address', type: 'url', required: true, help: 'In Zapier choose "Webhooks by Zapier", then "Catch Hook", and paste the address it gives you. It must start with https://.' },
  ],
};
