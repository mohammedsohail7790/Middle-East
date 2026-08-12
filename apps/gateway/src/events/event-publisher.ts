import { getCorrelation } from '../services/observability/correlation-context.js';
import type { PlatformEventType } from '../../../../infrastructure/events/event-types.js';
import type { PublishContext } from '../../../../infrastructure/events/event-envelope.js';
import { getPlatformEventBus } from './platform-event-bus.js';

/**
 * Fire-and-forget platform publish — never throws; isolated from call/runtime paths.
 */
export function publishPlatformEvent<T extends Record<string, unknown>>(
  eventType: PlatformEventType,
  payload: T,
  ctx: Partial<PublishContext> & { tenantId: string }
): void {
  const corr = getCorrelation();
  const bus = getPlatformEventBus();
  if (!bus) return;

  void import('../observability/enterprise/tracing.js')
    .then(({ startSpan, endSpan }) => {
      const sid = startSpan('event.publish', { eventType, tenantId: ctx.tenantId });
      setTimeout(() => endSpan(sid), 0);
    })
    .catch(() => {});

  bus.emit(eventType, payload, {
    producedBy: 'halla-ai-gateway',
    tenantId: ctx.tenantId,
    callSid: ctx.callSid ?? corr.callSid,
    sessionId: ctx.sessionId ?? corr.sessionId,
    userId: ctx.userId ?? corr.userId,
    correlationId: ctx.correlationId ?? corr.requestId,
    causationId: ctx.causationId,
    eventVersion: ctx.eventVersion,
  });
}
