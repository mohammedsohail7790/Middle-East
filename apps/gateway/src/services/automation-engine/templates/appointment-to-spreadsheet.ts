import type { AutomationTemplate } from '../types.js';

/** Saves about 2 minutes: copying each booking into a sheet by hand. */
export const appointmentToSpreadsheet: AutomationTemplate = {
  key: 'appointment-to-spreadsheet',
  name: 'Add every booking to my spreadsheet',
  description:
    'Each new appointment is sent to your Zapier or Google Sheets web address as one row: name, phone, email, service and time. This sends data outside Halla AI, so in "ask first" mode it waits for your yes; in automatic mode it runs by itself.',
  trigger: 'appointment.created',
  needs: ['A Zapier or Google Sheets web address (webhook)'],
  minutesSavedPerRun: 2,
  steps: [
    {
      key: 'send-to-sheet', kind: 'webhook.post', title: 'Send the booking to your spreadsheet', external: true,
      params: {
        url: '{{config.webhookUrl}}',
        body: { name: '{{trigger.name}}', phone: '{{trigger.phone}}', email: '{{trigger.email}}', service: '{{trigger.service}}', appointmentTime: '{{trigger.scheduledTime}}', bookedAt: '{{trigger.createdAt}}' },
      },
    },
  ],
  config: [
    { key: 'webhookUrl', label: 'Spreadsheet web address', type: 'url', required: true, help: 'In Zapier choose "Webhooks by Zapier", then "Catch Hook", and paste the address it gives you. It must start with https://.' },
  ],
};
