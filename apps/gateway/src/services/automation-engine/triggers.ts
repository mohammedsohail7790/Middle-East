import { logger } from '../logger.js';
import type { TriggerKind } from './types.js';

/**
 * The one door the real places (lead stored, call ended, call missed, appointment booked) use to start automations. It never throws, never waits for the automation,
 * and keeps personal data out of the payload: only the fields below survive, each cut short, and never a transcript. Businesses on the consent-capture track
 * (Medical Tourism) never start automations from here.
 */
const ALLOWED: Record<string, number> = {
  name: 120, phone: 40, email: 160, score: 10, summary: 400, service: 120, source: 60, reason: 40, outcome: 30, scheduledTime: 40, createdAt: 40, callSid: 80,
  callerName: 120, callerPhone: 40,
};

const QUALITY_SCORE: Record<string, number> = { high: 85, medium: 55, low: 25 };

export function sanitizeTriggerPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, max] of Object.entries(ALLOWED)) {
    const v = payload[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, max);
  }
  // A call has no numeric score of its own: derive one from the AI's high / medium / low rating so "hot lead" templates can compare it with a minimum.
  if (out.score === undefined && typeof payload.leadQuality === 'string') {
    const q = QUALITY_SCORE[payload.leadQuality.toLowerCase()];
    if (q !== undefined) out.score = q;
  }
  return out;
}

/** True for a business that handles health information on its own consent track, or when that cannot be told (stay out). */
async function isConsentTrack(tenantId: string): Promise<boolean> {
  try {
    const { isConsentCaptureTenant } = await import('../whatsapp/whatsapp.outbound.js');
    return await isConsentCaptureTenant(tenantId);
  } catch {
    return true;
  }
}

export async function emitAutomationTrigger(tenantId: string | undefined, kind: TriggerKind, ref: string | undefined, payload: Record<string, unknown>): Promise<void> {
  try {
    if (!tenantId || !ref) return;
    if (await isConsentTrack(tenantId)) return;
    const { emitTrigger } = await import('./engine.js');
    await emitTrigger(tenantId, kind, String(ref), sanitizeTriggerPayload(payload));
  } catch (e) {
    logger.warn('AUTOMATION_EMIT_FAILED', { trigger: kind, error: e instanceof Error ? e.name : 'error' });
  }
}

const MISSED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled']);
const ABANDONED_UNDER_SECONDS = 5;

/**
 * From a Twilio call-status callback: a call TO the business that nobody took (no answer, busy, failed, cancelled) or that hung up within a few seconds is a missed call.
 * `findTenant` turns the dialled number into a business. The call sid is the stable reference, so Twilio repeating the callback cannot start a second run.
 */
export async function emitMissedCallFromStatus(
  body: Record<string, unknown> | undefined,
  findTenant: (toNumber: string) => Promise<{ id: string } | null>,
): Promise<void> {
  try {
    const status = String(body?.CallStatus ?? '').toLowerCase();
    const callSid = String(body?.CallSid ?? '');
    if (!callSid || !String(body?.Direction ?? '').toLowerCase().startsWith('inbound')) return;
    const seconds = Number.parseInt(String(body?.CallDuration ?? ''), 10);
    const abandoned = status === 'completed' && Number.isFinite(seconds) && seconds < ABANDONED_UNDER_SECONDS;
    if (!MISSED_STATUSES.has(status) && !abandoned) return;
    const tenant = await findTenant(String(body?.To ?? ''));
    if (!tenant) return;
    await emitAutomationTrigger(tenant.id, 'call.missed', callSid, { callerPhone: String(body?.From ?? ''), reason: abandoned ? 'abandoned' : status, callSid });
  } catch (e) {
    logger.warn('AUTOMATION_EMIT_FAILED', { trigger: 'call.missed', error: e instanceof Error ? e.name : 'error' });
  }
}
