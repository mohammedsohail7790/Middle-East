import { randomUUID } from 'crypto';
import type { PlatformEventType } from './event-types.js';

/** Canonical platform event envelope (V4 P2). */
export interface PlatformEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: PlatformEventType;
  eventVersion: number;
  occurredAt: string;
  producedBy: string;
  tenantId: string;
  callSid?: string;
  sessionId?: string;
  userId?: string;
  correlationId?: string;
  causationId?: string;
  payload: TPayload;
}

export interface PublishContext {
  tenantId: string;
  producedBy?: string;
  callSid?: string;
  sessionId?: string;
  userId?: string;
  correlationId?: string;
  causationId?: string;
  eventVersion?: number;
}

export function createPlatformEvent<TPayload extends Record<string, unknown>>(
  eventType: PlatformEventType,
  payload: TPayload,
  ctx: PublishContext
): PlatformEvent<TPayload> {
  return {
    eventId: randomUUID(),
    eventType,
    eventVersion: ctx.eventVersion ?? 1,
    occurredAt: new Date().toISOString(),
    producedBy: ctx.producedBy ?? 'call-iq-gateway',
    tenantId: ctx.tenantId,
    callSid: ctx.callSid,
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    correlationId: ctx.correlationId,
    causationId: ctx.causationId,
    payload,
  };
}
