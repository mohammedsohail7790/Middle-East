import type { PlatformEvent } from '../../../../../infrastructure/events/event-envelope.js';
import { PlatformEventTypes } from '../../../../../infrastructure/events/event-types.js';
import { customWebhooksService, type KlarosSequenceStep } from '../../services/webhooks/webhooks.service.js';
import { isKlarosEventType, type KlarosEventType } from '../../security/klaros-event-types.js';
import { logger } from '../../services/logger.js';
import { sanitizeConsentEvidence } from '../../services/consent/consent-evidence.js';

/** Internal platform event type -> external Klaros contract event name. */
const EVENT_TYPE_MAP: Partial<Record<string, KlarosEventType>> = {
  [PlatformEventTypes.CALL_STARTED]: 'call.started',
  [PlatformEventTypes.CALL_ENDED]: 'call.completed',
  [PlatformEventTypes.LEAD_CREATED]: 'lead.created',
  [PlatformEventTypes.LEAD_UPDATED]: 'lead.updated',
  [PlatformEventTypes.LEAD_QUALIFIED]: 'lead.qualified',
  [PlatformEventTypes.LEAD_ESCALATED]: 'lead.escalated',
  [PlatformEventTypes.APPOINTMENT_CREATED]: 'appointment.confirmed',
  [PlatformEventTypes.APPOINTMENT_RESCHEDULED]: 'appointment.rescheduled',
  [PlatformEventTypes.APPOINTMENT_CANCELLED]: 'appointment.cancelled',
};

/**
 * Dispatches real external webhook events to Klaros (and any other
 * tenant-configured listener) whenever the underlying real event actually
 * occurs on the platform event bus — never synthesized for tests. Runs in
 * its own consumer group (see events/consumers/index.ts) so it observes
 * every call/lead/appointment event independently of the existing
 * analytics/notifications/lead/appointment consumers on the same streams.
 *
 * A finalized call (CALL_ENDED) is special: it carries the call's
 * lead.qualified payload (when a real qualification was determined) INSIDE the
 * same platform event, and both external events are delivered as one ordered
 * sequence — lead.qualified first, then call.completed. Two independent stream
 * entries cannot guarantee that: if lead.qualified's delivery failed and
 * call.completed's succeeded, the retry of the former would land after the
 * latter.
 */
export async function handleKlarosWebhookEvent(
  event: PlatformEvent,
  meta?: { finalAttempt?: boolean }
): Promise<void> {
  const klarosType = EVENT_TYPE_MAP[event.eventType];
  if (!klarosType || !isKlarosEventType(klarosType)) return;

  const steps =
    event.eventType === PlatformEventTypes.CALL_ENDED
      ? buildCallFinalizationSequence(event)
      : [{ type: klarosType, eventId: event.eventId, data: buildEventData(klarosType, event) }];

  try {
    await customWebhooksService.dispatchKlarosSequence(event.tenantId, steps, {
      finalAttempt: meta?.finalAttempt,
    });
  } catch (err) {
    // Rethrow — the platform event bus's own bounded-retry/backoff/DLQ
    // handling (infrastructure/events/event-consumer.ts) takes it from here.
    logger.warn('KLAROS_WEBHOOK_DISPATCH_FAILED', {
      tenantId: event.tenantId,
      eventType: klarosType,
      eventId: event.eventId,
      steps: steps.map((s) => s.type),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** lead.qualified (when present) then call.completed. Ids are derived from the platform event id so retries reuse them. */
function buildCallFinalizationSequence(event: PlatformEvent): KlarosSequenceStep[] {
  const payload = event.payload as Record<string, unknown>;
  const steps: KlarosSequenceStep[] = [];

  const qualification = payload.qualificationEvent as Record<string, unknown> | undefined;
  if (qualification && qualification.status && qualification.status !== 'unknown') {
    steps.push({
      type: 'lead.qualified',
      eventId: `${event.eventId}:lead.qualified`,
      data: buildEventData('lead.qualified', {
        ...event,
        payload: { ...qualification, callId: payload.callSid },
      } as PlatformEvent),
    });
  }

  steps.push({
    type: 'call.completed',
    eventId: event.eventId,
    data: buildEventData('call.completed', event),
  });
  return steps;
}

/** Shapes the payload appropriate for each external event — no unnecessary PII or secrets. */
function buildEventData(klarosType: KlarosEventType, event: PlatformEvent): Record<string, unknown> {
  const payload = event.payload as Record<string, unknown>;

  switch (klarosType) {
    case 'call.started':
      return { callId: event.callSid ?? payload.callSid };
    case 'call.completed':
      return {
        callId: event.callSid ?? payload.callSid,
        durationMs: payload.durationMs,
        klarosLeadId: payload.klarosLeadId,
        qualificationStatus: payload.qualificationStatus,
        escalation: payload.escalation,
        appointmentId: payload.appointmentId,
      };
    case 'lead.created':
    case 'lead.updated': {
      // Optional consent evidence: rebuilt field by field from a validated shape, or omitted. Never defaulted, never inferred.
      const consent = sanitizeConsentEvidence(payload.consent);
      return {
        leadId: payload.leadId,
        phone: payload.phone,
        name: payload.name,
        callId: payload.callId ?? event.callSid,
        klarosLeadId: payload.klarosLeadId,
        ...(consent ? { consent } : {}),
      };
    }
    case 'lead.qualified':
      return {
        leadId: payload.leadId,
        callId: event.callSid ?? payload.callId,
        klarosLeadId: payload.klarosLeadId,
        status: payload.status,
        // Same value under the key the Klaros receiver reads (it looks for `qualification` / `qualification_status` /
        // `qualificationStatus`, never `status`; without this a not_qualified outcome would default to "qualified" there).
        // Additive: receivers that read `status` are unaffected.
        qualification: payload.status,
        fields: payload.fields,
        missingFields: payload.missingFields,
        reason: payload.reason,
        confidence: payload.confidence,
      };
    case 'lead.escalated':
      return {
        callId: event.callSid ?? payload.callId,
        leadId: payload.leadId,
        klarosLeadId: payload.klarosLeadId,
        target: payload.target,
        reason: payload.reason,
      };
    case 'appointment.requested':
    case 'appointment.confirmed':
    case 'appointment.rescheduled':
    case 'appointment.cancelled':
      return {
        appointmentId: payload.appointmentId,
        scheduledTime: payload.scheduledTime,
        reason: payload.reason,
        leadId: payload.leadId,
        klarosLeadId: payload.klarosLeadId,
      };
    default:
      return payload;
  }
}
