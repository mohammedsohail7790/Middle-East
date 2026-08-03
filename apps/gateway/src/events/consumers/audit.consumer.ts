import type { PlatformEvent } from '../../../../../infrastructure/events/event-envelope.js';
import { logger } from '../../services/logger.js';

/** Immutable-style audit log line for every consumed platform event. */
export async function handleAuditEvent(event: PlatformEvent): Promise<void> {
  logger.info('PLATFORM_EVENT_AUDIT', {
    eventId: event.eventId,
    eventType: event.eventType,
    eventVersion: event.eventVersion,
    tenantId: event.tenantId,
    callSid: event.callSid,
    sessionId: event.sessionId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    occurredAt: event.occurredAt,
    producedBy: event.producedBy,
  });
}
