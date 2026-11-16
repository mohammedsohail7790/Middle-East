import type { AutomationTemplate } from '../types.js';

/** Saves about 2 minutes: checking the calendar to find out what was booked overnight. */
export const newBookingAlert: AutomationTemplate = {
  key: 'new-booking-alert',
  name: 'Tell me about every new booking',
  description:
    'Whenever an appointment is booked, your team is alerted and you get an email with the name, phone, service and time. Both alerts change things outside Halla AI, so in "ask first" mode each waits for your yes.',
  trigger: 'appointment.created',
  needs: ['Appointments booked through Halla AI'],
  minutesSavedPerRun: 2,
  steps: [
    {
      key: 'tell-team', kind: 'notify.team', title: 'Alert your team', external: true,
      params: { title: 'New booking: {{trigger.name}}', message: '{{trigger.name}} ({{trigger.phone}}) booked {{trigger.service}} for {{trigger.scheduledTime}}.' },
    },
    {
      key: 'email-owner', kind: 'email.send', title: 'Email you the details', external: true,
      params: { to: '{{config.ownerEmail}}', subject: 'New booking: {{trigger.name}}', body: '{{trigger.name}} ({{trigger.phone}}, {{trigger.email}}) booked {{trigger.service}} for {{trigger.scheduledTime}}.' },
    },
  ],
  config: [
    { key: 'ownerEmail', label: 'Your email address', type: 'email', required: true, help: 'Where the new booking email is sent.' },
  ],
};
