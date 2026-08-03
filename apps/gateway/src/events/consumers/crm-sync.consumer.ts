import type { PlatformEvent } from '../../../../../infrastructure/events/event-envelope.js';
import { PlatformEventTypes } from '../../../../../infrastructure/events/event-types.js';
import { publishPlatformEvent } from '../event-publisher.js';
import { logger } from '../../services/logger.js';
import {
  isP2ShadowVerificationEnabled,
  logShadowVerification,
  shouldConsumerExecute,
} from '../shadow-verification.js';

export async function handleCrmSyncEvent(event: PlatformEvent): Promise<void> {
  if (event.eventType !== PlatformEventTypes.CRM_SYNC_REQUESTED) return;

  const payload = event.payload as {
    callId?: string;
    type?: 'lead' | 'appointment' | 'reschedule';
    lead?: Record<string, unknown>;
    appointment?: Record<string, unknown>;
  };

  const callId = payload.callId || event.callSid;
  if (!callId) return;

  const integrationPayload = {
    callId,
    type: payload.type || 'lead',
    lead: (payload.lead || {}) as Record<string, unknown>,
    appointment: payload.appointment as Record<string, unknown> | undefined,
  };

  if (isP2ShadowVerificationEnabled() && !shouldConsumerExecute('crm_sync')) {
    logShadowVerification('crm_sync', event, integrationPayload);
    return;
  }

  const { integrationService } = await import('../../services/integrations/integration.service.js');
  try {
    await integrationService.sendRealtime(event.tenantId, {
      callId: integrationPayload.callId,
      type: integrationPayload.type as 'lead' | 'appointment' | 'reschedule',
      lead: integrationPayload.lead as any,
      appointment: integrationPayload.appointment as any,
    });
    publishPlatformEvent(
      PlatformEventTypes.CRM_SYNC_COMPLETED,
      { callId, type: payload.type || 'lead' },
      {
        tenantId: event.tenantId,
        callSid: event.callSid,
        sessionId: event.sessionId,
        causationId: event.eventId,
      }
    );
  } catch (err) {
    logger.warn('CRM_SYNC_CONSUMER_FAILED', {
      tenantId: event.tenantId,
      callId,
      error: String(err),
    });
    publishPlatformEvent(
      PlatformEventTypes.CRM_SYNC_FAILED,
      { callId, error: String(err) },
      {
        tenantId: event.tenantId,
        callSid: event.callSid,
        causationId: event.eventId,
      }
    );
    throw err;
  }
}
