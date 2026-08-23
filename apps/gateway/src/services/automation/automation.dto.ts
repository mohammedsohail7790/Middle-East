const TRIGGER_MAP: Record<string, string> = {
  call_completed: 'call_ended',
  call_ended: 'call_ended',
  missed_call: 'call_ended',
  voicemail: 'call_ended',
  low_score: 'call_ended',
  lead_created: 'lead_created',
  appointment_set: 'appointment_created',
  appointment_created: 'appointment_created',
  appointment_reminder: 'appointment_reminder',
};

const TRIGGER_UI: Record<string, string> = {
  call_ended: 'call_completed',
  lead_created: 'lead_created',
  appointment_created: 'appointment_set',
  appointment_reminder: 'appointment_reminder',
};

// SMS notifications are retired — legacy send_sms rules deliver by email.
const ACTION_MAP: Record<string, string> = {
  send_sms: 'send_email',
  send_email: 'send_email',
  create_task: 'create_task',
  notify_team: 'send_email',
  update_crm: 'create_task',
  schedule_callback: 'send_email',
};

export function normalizeAutomationTrigger(trigger: string): string {
  return TRIGGER_MAP[trigger] || trigger;
}

export function toDashboardTrigger(trigger: string): string {
  return TRIGGER_UI[trigger] || trigger;
}

export function normalizeAutomationAction(action: string): string {
  return ACTION_MAP[action] || 'send_email';
}

export function toDashboardRule(rule: Record<string, unknown>) {
  return {
    ...rule,
    trigger: toDashboardTrigger(String(rule.trigger || '')),
    runs: 0,
  };
}
