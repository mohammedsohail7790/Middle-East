import type { RedisPlatformEventBus } from '../../../../../infrastructure/events/event-bus.js';
import { streamKey } from '../../../../../infrastructure/events/event-types.js';
import type { PlatformEvent } from '../../../../../infrastructure/events/event-envelope.js';
import { handleCrmSyncEvent } from './crm-sync.consumer.js';
import { handleAnalyticsEvent } from './analytics.consumer.js';
import { handleAutomationEvent } from './automation.consumer.js';
import { handleAuditEvent } from './audit.consumer.js';
import { handleNotificationsEvent } from './notifications.consumer.js';
import { handleLeadEvent } from './lead.consumer.js';
import { handleAppointmentEvent } from './appointment.consumer.js';

async function withAudit(
  event: PlatformEvent,
  handler: (e: PlatformEvent) => Promise<void>
): Promise<void> {
  await handleAuditEvent(event);
  await handler(event);
}

export function registerPlatformConsumers(bus: RedisPlatformEventBus): void {
  bus.registerConsumer('crm-sync', [streamKey('integration-events')], (event) =>
    withAudit(event, handleCrmSyncEvent)
  );

  bus.registerConsumer('analytics', [streamKey('analytics-events')], (event) =>
    withAudit(event, handleAnalyticsEvent)
  );

  bus.registerConsumer('automation', [streamKey('automation-events'), streamKey('call-events')], (event) =>
    withAudit(event, handleAutomationEvent)
  );

  bus.registerConsumer('notifications', [streamKey('call-events')], (event) =>
    withAudit(event, handleNotificationsEvent)
  );

  bus.registerConsumer('lead', [streamKey('lead-events')], (event) =>
    withAudit(event, handleLeadEvent)
  );

  bus.registerConsumer('appointment', [streamKey('appointment-events')], (event) =>
    withAudit(event, handleAppointmentEvent)
  );
}
