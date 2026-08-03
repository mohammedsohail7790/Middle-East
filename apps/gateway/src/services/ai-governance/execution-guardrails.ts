import type { ToolExecutionPolicy } from './tool-policy-engine.js';

export interface GuardrailContext {
  tenantId: string;
  sessionId: string;
  callSid: string;
  toolName: string;
  parameters: Record<string, unknown>;
  policy: ToolExecutionPolicy;
}

export interface GuardrailResult {
  ok: boolean;
  reason?: string;
  trigger?: string;
}

const E164_LOOSE = /^\+?[1-9]\d{6,14}$/;

function normalizePhone(p: unknown): string {
  return String(p || '').replace(/\D/g, '');
}

export function runExecutionGuardrails(ctx: GuardrailContext): GuardrailResult {
  const params = ctx.parameters || {};

  if (!ctx.toolName || typeof ctx.toolName !== 'string') {
    return { ok: false, reason: 'Invalid tool name', trigger: 'malformed_tool' };
  }

  if (ctx.toolName.includes('appointment') || ctx.toolName.includes('schedule')) {
    const time =
      params.new_time || params.preferred_time || params.time || params.scheduled_time;
    if (time) {
      const parsed = new Date(String(time));
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, reason: 'Invalid appointment time', trigger: 'timezone_validation' };
      }
      if (parsed.getTime() < Date.now() - 60_000) {
        return { ok: false, reason: 'Appointment time is in the past', trigger: 'booking_sanity' };
      }
    }
  }

  if (ctx.toolName === 'send_sms' || ctx.toolName === 'create_lead') {
    const phone = normalizePhone(params.phone || params.to);
    if (phone && phone.length < 10) {
      return { ok: false, reason: 'Invalid phone number', trigger: 'phone_validation' };
    }
  }

  if (ctx.toolName === 'transfer_call') {
    const dest = String(params.phone || params.number || '');
    if (!E164_LOOSE.test(dest.replace(/\s/g, ''))) {
      return { ok: false, reason: 'Invalid transfer destination', trigger: 'transfer_safety' };
    }
  }

  if (ctx.policy.constraints?.businessHoursOnly) {
    const hour = new Date().getHours();
    if (hour < 8 || hour >= 20) {
      return { ok: false, reason: 'Outside business hours', trigger: 'business_hours' };
    }
  }

  return { ok: true };
}
