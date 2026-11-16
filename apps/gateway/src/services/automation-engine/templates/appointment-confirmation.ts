import type { AutomationTemplate } from '../types.js';

/** Saves about 3 minutes: writing a confirmation email by hand for each booking, and the chance of forgetting one. */
export const appointmentConfirmation: AutomationTemplate = {
  key: 'appointment-confirmation',
  name: 'Email customers a booking confirmation',
  description:
    'When an appointment is booked, the customer gets a short confirmation email with the service and time. If they gave no email address, nothing is sent. This writes to your customer, so in "ask first" mode each email waits for your yes; in automatic mode it is sent by itself.',
  trigger: 'appointment.created',
  needs: ['Appointments booked through Halla AI'],
  minutesSavedPerRun: 3,
  steps: [
    {
      key: 'email-customer', kind: 'email.send', title: 'Email the customer a confirmation', external: true,
      params: {
        to: 'customer',
        subject: 'Your booking with {{config.businessName}} is confirmed',
        body: 'Hello {{trigger.name}},\n\nYour booking with {{config.businessName}} is confirmed.\n\nService: {{trigger.service}}\nTime: {{trigger.scheduledTime}}\n\n{{config.extraNote}}\n\nIf you need to change it, please reply to this email or call us.',
      },
    },
  ],
  config: [
    { key: 'businessName', label: 'Your business name', type: 'text', required: true, help: 'Shown in the email so the customer knows who it is from.' },
    { key: 'extraNote', label: 'An extra line for the customer', type: 'text', default: 'We look forward to seeing you.', help: 'For example: where to park, what to bring, or how early to arrive.' },
  ],
};
