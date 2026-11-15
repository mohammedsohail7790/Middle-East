import type { AutomationTemplate } from '../types.js';

/** Saves about 3 minutes: noticing a missed call, finding the number and telling the right person is a chore that is often skipped when busy. */
export const missedCallFollowup: AutomationTemplate = {
  key: 'missed-call-followup',
  name: 'Email me about missed calls',
  description:
    'When a call is missed, your team is told and an email with the caller\'s number is sent to you, so nobody is forgotten. Nothing is sent to the caller. Emailing is an outside action, so in "ask first" mode you approve each one; in automatic mode it is sent by itself.',
  trigger: 'call.missed',
  needs: ['A phone number connected to Halla AI'],
  minutesSavedPerRun: 3,
  steps: [
    {
      key: 'tell-team', kind: 'notify.team', title: 'Tell your team about the missed call', external: true,
      params: { title: 'Missed call from {{trigger.callerPhone}}', message: 'We missed a call from {{trigger.callerPhone}}. Please call them back.' },
    },
    {
      key: 'email-owner', kind: 'email.send', title: 'Email you the missed call', external: true,
      params: { to: '{{config.ownerEmail}}', subject: 'Missed call from {{trigger.callerPhone}}', body: 'We missed a call from {{trigger.callerPhone}}. Please call them back as soon as you can.' },
    },
  ],
  config: [
    { key: 'ownerEmail', label: 'Your email address', type: 'email', required: true, help: 'Where the missed call email is sent.' },
  ],
};
