import type { AutomationTemplate } from '../types.js';

/** Saves about 5 minutes: reading a form, contract or receipt and typing the key details elsewhere typically takes a few minutes; the AI may still need a quick check. */
export const documentIntake: AutomationTemplate = {
  key: 'document-intake',
  name: 'Read my documents and file the details',
  description:
    'Upload an intake form, contract or receipt and AI reads it, pulls out the details you choose and sends them to your web address, then tells your team. Reading the document runs by itself and the file is not kept; sending the details and the alert change things outside Halla AI, so in "ask first" mode each waits for your yes.',
  trigger: 'document.received',
  needs: ['A Zapier or Google Sheets web address (webhook)'],
  minutesSavedPerRun: 5,
  steps: [
    { key: 'read-document', kind: 'document.extract', title: 'Read the document with AI', external: false, params: { fields: '{{config.fields}}', text: '{{trigger.text}}', imageDataUrl: '{{trigger.imageDataUrl}}' } },
    {
      key: 'send-details', kind: 'webhook.post', title: 'Send the details to your web address', external: true,
      params: { url: '{{config.webhookUrl}}', body: '{{steps.read-document.fields}}', fileName: '{{trigger.fileName}}' },
    },
    {
      key: 'tell-team', kind: 'notify.team', title: 'Tell your team a document was filed', external: true,
      params: { title: 'Document read: {{trigger.fileName}}', message: 'AI read {{trigger.fileName}}. {{steps.read-document.summaryText}} Please check anything marked unsure.' },
    },
  ],
  config: [
    { key: 'fields', label: 'What to pull out of each document', type: 'text', default: 'customer name, date, total amount, reference number', help: 'List the details you want, separated by commas. Anything the document does not contain is left empty.' },
    { key: 'webhookUrl', label: 'Where to send the details', type: 'url', required: true, help: 'A Zapier or Google Sheets webhook address that starts with https://.' },
  ],
};
