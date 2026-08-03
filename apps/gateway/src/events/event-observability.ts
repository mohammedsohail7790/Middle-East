import { logger } from '../services/logger.js';
import type { PlatformEvent } from '../../../../infrastructure/events/event-envelope.js';

export type EventTelemetryKind =
  | 'EVENT_PUBLISHED'
  | 'EVENT_CONSUMED'
  | 'EVENT_RETRY'
  | 'EVENT_DLQ'
  | 'EVENT_REPLAYED';

export function logEventTelemetry(
  kind: EventTelemetryKind,
  fields: Record<string, string | number | boolean | undefined>
): void {
  if (kind === 'EVENT_DLQ') {
    logger.warn(kind, fields);
  } else {
    logger.info(kind, fields);
  }
}

export function fieldsFromPlatformEvent(
  event: PlatformEvent,
  extra: Record<string, string | number | boolean | undefined> = {}
): Record<string, string | number | boolean | undefined> {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    tenantId: event.tenantId,
    callSid: event.callSid,
    sessionId: event.sessionId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    ...extra,
  };
}
