import type { PlatformEvent } from '../../../../../infrastructure/events/event-envelope.js';
import { PlatformEventTypes } from '../../../../../infrastructure/events/event-types.js';
import { logger } from '../../services/logger.js';

const ANALYTICS_TYPES = new Set<string>([
  PlatformEventTypes.TOOL_EXECUTED,
  PlatformEventTypes.TOOL_SKIPPED_IDEMPOTENT,
  PlatformEventTypes.CALL_ENDED,
  PlatformEventTypes.CALL_SUMMARY_GENERATED,
  PlatformEventTypes.APPOINTMENT_CREATED,
]);

export async function handleAnalyticsEvent(event: PlatformEvent): Promise<void> {
  if (!ANALYTICS_TYPES.has(event.eventType)) return;
  logger.info('ANALYTICS_EVENT_RECORDED', {
    eventId: event.eventId,
    eventType: event.eventType,
    tenantId: event.tenantId,
    callSid: event.callSid,
  });
}
