import { createHash } from 'crypto';
import { logger } from '../services/logger.js';
import type { PlatformEvent } from '../../../../infrastructure/events/event-envelope.js';

export type ShadowWorkflow =
  | 'crm_sync'
  | 'automation'
  | 'notifications'
  | 'lead'
  | 'appointment';

/** Dual-execution verification: async consumer logs payload; sync path stays authoritative. */
export function isP2ShadowVerificationEnabled(): boolean {
  return process.env.CALLIQ_P2_SHADOW_VERIFY === 'true';
}

function stablePayloadHash(payload: unknown): string {
  try {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  } catch {
    return 'unhashable';
  }
}

export function logShadowVerification(
  workflow: ShadowWorkflow,
  event: PlatformEvent,
  asyncPayload: unknown,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  logger.info('P2_SHADOW_VERIFY_ASYNC', {
    workflow,
    eventId: event.eventId,
    eventType: event.eventType,
    tenantId: event.tenantId,
    callSid: event.callSid,
    correlationId: event.correlationId,
    causationId: event.causationId,
    payloadHash: stablePayloadHash(asyncPayload),
    asyncPayload,
    sideEffectsSuppressed: true,
    ...extra,
  });
}

export function logShadowSyncBaseline(
  workflow: ShadowWorkflow,
  tenantId: string,
  syncPayload: unknown,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  if (!isP2ShadowVerificationEnabled()) return;
  logger.info('P2_SHADOW_VERIFY_SYNC', {
    workflow,
    tenantId,
    payloadHash: stablePayloadHash(syncPayload),
    syncPayload,
    authoritative: true,
    ...extra,
  });
}

/** True when consumer should execute side effects (not shadow-only). */
export function shouldConsumerExecute(workflow: ShadowWorkflow): boolean {
  switch (workflow) {
    case 'crm_sync':
      return process.env.CALLIQ_P2_ASYNC_INTEGRATIONS === 'true';
    case 'automation':
      return process.env.CALLIQ_P2_ASYNC_AUTOMATION === 'true';
    case 'notifications':
      return process.env.CALLIQ_P2_ASYNC_NOTIFICATIONS === 'true';
    case 'lead':
      return process.env.CALLIQ_P2_ASYNC_LEADS === 'true';
    case 'appointment':
      return process.env.CALLIQ_P2_ASYNC_APPOINTMENTS === 'true';
    default:
      return false;
  }
}
