import type { PlatformEvent } from '../../../../../infrastructure/events/event-envelope.js';
import { PlatformEventTypes } from '../../../../../infrastructure/events/event-types.js';
import { logger } from '../../services/logger.js';
import {
  isP2ShadowVerificationEnabled,
  logShadowVerification,
  shouldConsumerExecute,
} from '../shadow-verification.js';

export async function handleNotificationsEvent(event: PlatformEvent): Promise<void> {
  if (event.eventType !== PlatformEventTypes.CALL_ENDED) return;

  const payload = event.payload as {
    durationMs?: number;
    callerPhone?: string;
    hasTranscript?: boolean;
  };

  const notificationPayload = {
    from: payload.callerPhone || 'Unknown',
    duration: payload.durationMs || 0,
  };

  if (isP2ShadowVerificationEnabled() && !shouldConsumerExecute('notifications')) {
    logShadowVerification('notifications', event, notificationPayload);
    return;
  }
  if (!shouldConsumerExecute('notifications')) return;

  try {
    const { slackService } = await import('../../services/slack/slack.service.js');
    await slackService.sendNewCallNotification(event.tenantId, notificationPayload);
  } catch (err) {
    logger.debug('NOTIFICATIONS_CONSUMER_SKIP', {
      tenantId: event.tenantId,
      reason: String(err),
    });
  }
}
