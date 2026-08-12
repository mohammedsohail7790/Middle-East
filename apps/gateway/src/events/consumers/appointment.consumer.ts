import type { PlatformEvent } from '../../../../../infrastructure/events/event-envelope.js';
import { PlatformEventTypes } from '../../../../../infrastructure/events/event-types.js';
import { logger } from '../../services/logger.js';
import {
  isP2ShadowVerificationEnabled,
  logShadowVerification,
  shouldConsumerExecute,
} from '../shadow-verification.js';

const APPOINTMENT_TYPES = new Set<string>([
  PlatformEventTypes.APPOINTMENT_CREATED,
  PlatformEventTypes.APPOINTMENT_RESCHEDULED,
  PlatformEventTypes.APPOINTMENT_CANCELLED,
]);

export async function handleAppointmentEvent(event: PlatformEvent): Promise<void> {
  if (!APPOINTMENT_TYPES.has(event.eventType)) return;

  const payload = event.payload as {
    appointmentId?: string;
    scheduledTime?: string;
    phone?: string;
    name?: string;
    service?: string;
    reason?: string;
  };

  if (isP2ShadowVerificationEnabled() && !shouldConsumerExecute('appointment')) {
    logShadowVerification('appointment', event, payload);
    return;
  }
  if (!shouldConsumerExecute('appointment')) return;

  const { publishDashboardPushType } = await import('../../services/dashboard/dashboard-events.js');
  publishDashboardPushType(event.tenantId, 'calendar.updated', ['leads'], {
    appointmentId: payload.appointmentId,
    eventType: event.eventType,
  });

  logger.info('APPOINTMENT_EVENT_CONSUMED', {
    tenantId: event.tenantId,
    eventType: event.eventType,
    appointmentId: payload.appointmentId,
  });
}
