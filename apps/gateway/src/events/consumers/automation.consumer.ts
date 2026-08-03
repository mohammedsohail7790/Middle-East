import type { PlatformEvent } from '../../../../../infrastructure/events/event-envelope.js';
import { PlatformEventTypes } from '../../../../../infrastructure/events/event-types.js';
import { logger } from '../../services/logger.js';
import {
  isP2ShadowVerificationEnabled,
  logShadowVerification,
  shouldConsumerExecute,
} from '../shadow-verification.js';

export async function handleAutomationEvent(event: PlatformEvent): Promise<void> {
  if (
    event.eventType !== PlatformEventTypes.SMS_SENT &&
    event.eventType !== PlatformEventTypes.AUTOMATION_TRIGGERED &&
    event.eventType !== PlatformEventTypes.CALL_ENDED
  ) {
    return;
  }

  if (event.eventType === PlatformEventTypes.CALL_ENDED) {
    const payload = event.payload as { callerPhone?: string; callSid?: string };
    const phone = payload.callerPhone || '';
    const callSid = payload.callSid || event.callSid || '';
    if (!phone && !callSid) return;

    const followUpPayload = { tenantId: event.tenantId, callSid, phone };
    if (isP2ShadowVerificationEnabled() && !shouldConsumerExecute('automation')) {
      logShadowVerification('automation', event, followUpPayload);
      return;
    }
    if (!shouldConsumerExecute('automation')) return;

    const { automationService } = await import('../../services/automation/automation.service.js');
    await automationService
      .sendCallFollowUp(event.tenantId, callSid, phone)
      .catch((err) => {
        logger.warn('AUTOMATION_CONSUMER_FOLLOWUP_FAILED', {
          tenantId: event.tenantId,
          error: String(err),
        });
      });
    return;
  }

  logger.info('AUTOMATION_EVENT_RECORDED', {
    eventId: event.eventId,
    eventType: event.eventType,
    tenantId: event.tenantId,
  });
}
