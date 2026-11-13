import type { AutomationTemplate } from '../types.js';

/** Saves about 3 minutes: finding the number, writing and sending a polite message back is a 2 to 4 minute chore, and it is often skipped when busy. */
export const missedCallFollowup: AutomationTemplate = {
  key: 'missed-call-followup',
  name: 'Text back callers I missed',
  description:
    'When a call is missed, the caller gets a polite message (WhatsApp first, a text message if WhatsApp is not possible) and your team is told. Sending a message to a customer is an outside action, so in "ask first" mode you approve each one; in automatic mode it is sent by itself.',
  trigger: 'call.missed',
  needs: ['WhatsApp or SMS set up for your number'],
  minutesSavedPerRun: 3,
  steps: [
    {
      key: 'message-caller', kind: 'message.send', title: 'Message the caller', external: true,
      params: { to: '{{trigger.callerPhone}}', text: '{{config.messageText}}', senderName: '{{config.businessName}}', channelOrder: ['whatsapp', 'sms'] },
    },
    {
      key: 'tell-team', kind: 'notify.team', title: 'Tell your team about the missed call', external: true,
      params: { title: 'Missed call from {{trigger.callerPhone}}', message: 'We missed a call from {{trigger.callerPhone}} and sent a message back. Please follow up.' },
    },
  ],
  config: [
    { key: 'businessName', label: 'Your business name', type: 'text', required: true, help: 'Shown to the caller as the sender of the message, for example "Al Noor Dental".' },
    {
      key: 'messageText', label: 'Message to send', type: 'text',
      default: 'Hello, sorry we missed your call. We will get back to you as soon as we can. If it is urgent, just reply to this message.',
      help: 'Keep it short and friendly. The caller gets exactly these words.',
    },
  ],
};
