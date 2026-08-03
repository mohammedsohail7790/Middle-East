import type { PlatformEvent } from '../../../../../infrastructure/events/event-envelope.js';
import { PlatformEventTypes } from '../../../../../infrastructure/events/event-types.js';
import { publishPlatformEvent } from '../event-publisher.js';
import { logger } from '../../services/logger.js';
import {
  isP2ShadowVerificationEnabled,
  logShadowVerification,
  shouldConsumerExecute,
} from '../shadow-verification.js';

const LEAD_TYPES = new Set<string>([
  PlatformEventTypes.LEAD_CREATED,
  PlatformEventTypes.LEAD_UPDATED,
]);

export async function handleLeadEvent(event: PlatformEvent): Promise<void> {
  if (!LEAD_TYPES.has(event.eventType)) return;

  const payload = event.payload as {
    leadId?: string;
    phone?: string;
    name?: string;
    callId?: string;
    callSid?: string;
  };

  const pushType =
    event.eventType === PlatformEventTypes.LEAD_UPDATED ? 'lead.updated' : 'lead.created';

  if (isP2ShadowVerificationEnabled() && !shouldConsumerExecute('lead')) {
    logShadowVerification('lead', event, { pushType, leadId: payload.leadId });
    return;
  }
  if (!shouldConsumerExecute('lead')) return;

  const { publishDashboardPushType } = await import('../../services/dashboard/dashboard-events.js');
  publishDashboardPushType(event.tenantId, pushType, [], {
    leadId: payload.leadId,
    phone: payload.phone,
  });

  if (event.eventType === PlatformEventTypes.LEAD_CREATED) {
    const callId = payload.callId || payload.callSid || payload.leadId;
    if (callId) {
      publishPlatformEvent(
        PlatformEventTypes.CRM_SYNC_REQUESTED,
        {
          callId,
          type: 'lead',
          lead: {
            name: payload.name,
            phone: payload.phone,
          },
        },
        {
          tenantId: event.tenantId,
          callSid: payload.callSid,
          causationId: event.eventId,
        }
      );
    }
  }

  logger.info('LEAD_EVENT_CONSUMED', {
    tenantId: event.tenantId,
    eventType: event.eventType,
    leadId: payload.leadId,
  });
}
