import type { AutomationTemplate } from '../types.js';

/** Saves about 2 minutes: it replaces reading the call summary to decide who is worth calling first, and the manual "this one is hot" message to the owner. */
export const hotLeadAlert: AutomationTemplate = {
  key: 'hot-lead-alert',
  name: 'Alert me about hot leads',
  description:
    'After each call the lead is scored. When the score reaches your minimum, your team and you are alerted straight away; below it, nothing is sent. The score check runs by itself; the alerts change things outside Halla AI, so in "ask first" mode each waits for your yes.',
  trigger: 'call.ended',
  needs: ['Lead scoring on your calls'],
  minutesSavedPerRun: 2,
  steps: [
    // data.transform with mode "min-score" outputs { belowMinimum: boolean, score: number|null }; later steps use skipIf to stay quiet for cold leads.
    {
      key: 'check-score', kind: 'data.transform', title: 'Check whether the lead is hot enough', external: false,
      params: { mode: 'min-score', score: '{{trigger.score}}', minScore: '{{config.minScore}}' },
    },
    {
      key: 'tell-team', kind: 'notify.team', title: 'Alert your team', external: true, skipIf: '{{steps.check-score.belowMinimum}}',
      params: { title: 'Hot lead: {{trigger.callerName}}', message: '{{trigger.callerName}} ({{trigger.callerPhone}}) scored {{steps.check-score.score}}. {{trigger.summary}}' },
    },
    {
      key: 'email-owner', kind: 'email.send', title: 'Email you the details', external: true, skipIf: '{{steps.check-score.belowMinimum}}',
      params: { to: '{{config.ownerEmail}}', subject: 'Hot lead: {{trigger.callerName}} (score {{steps.check-score.score}})', body: '{{trigger.callerName}} ({{trigger.callerPhone}}) just finished a call and scored {{steps.check-score.score}}. {{trigger.summary}}' },
    },
  ],
  config: [
    { key: 'minScore', label: 'Lowest score that counts as hot', type: 'number', default: 70, help: 'Scores run from 0 to 100. Raise this to hear about fewer leads, lower it to hear about more.' },
    { key: 'ownerEmail', label: 'Your email address', type: 'email', required: true, help: 'Where the hot lead email is sent.' },
  ],
};
