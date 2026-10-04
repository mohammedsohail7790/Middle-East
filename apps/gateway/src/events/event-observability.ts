import { logger } from '../services/logger.js';
import type { PlatformEvent } from '../../../../infrastructure/events/event-envelope.js';

export type EventTelemetryKind =
  | 'EVENT_PUBLISHED'
  | 'EVENT_CONSUMED'
  | 'EVENT_RETRY'
  | 'EVENT_DLQ'
  | 'EVENT_REPLAYED'
  | 'EVENT_PUBLISH_FAILED'
  | 'EVENT_UNDECODABLE'
  | 'CONSUMER_LOOP_ERROR';

export function logEventTelemetry(
  kind: EventTelemetryKind,
  fields: Record<string, string | number | boolean | undefined>
): void {
  if (
    kind === 'EVENT_DLQ' ||
    kind === 'EVENT_PUBLISH_FAILED' ||
    kind === 'EVENT_UNDECODABLE' ||
    kind === 'CONSUMER_LOOP_ERROR'
  ) {
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
