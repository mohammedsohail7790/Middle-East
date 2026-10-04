import type { Redis } from 'ioredis';

const PREFIX = 'calliq:event:processed:';
const DEFAULT_TTL_SEC = Number(process.env.P2_EVENT_IDEMPOTENCY_TTL_SEC || 604800);

/**
 * Idempotency state is scoped per CONSUMER GROUP: each group is an independent
 * processing pipeline and must handle a given event exactly once on its own.
 * Keying on the event id alone made every group compete for one claim, so the
 * first group to run starved all the others (e.g. the Klaros webhook group).
 */
function processedKey(groupName: string, eventId: string): string {
  return `${PREFIX}${groupName}:${eventId}`;
}

export async function isEventAlreadyProcessed(
  redis: Redis,
  groupName: string,
  eventId: string
): Promise<boolean> {
  const v = await redis.get(processedKey(groupName, eventId));
  return v === '1';
}

export async function markEventProcessed(
  redis: Redis,
  groupName: string,
  eventId: string,
  ttlSec = DEFAULT_TTL_SEC
): Promise<void> {
  await redis.set(processedKey(groupName, eventId), '1', 'EX', ttlSec);
}

export async function claimEventForProcessing(
  redis: Redis,
  groupName: string,
  eventId: string,
  ttlSec = 300
): Promise<boolean> {
  const result = await redis.set(processedKey(groupName, eventId), 'processing', 'EX', ttlSec, 'NX');
  return result === 'OK';
}

export type EventClaimState = 'processed' | 'processing' | 'none';

/** Distinguishes "already handled" from "another worker is handling it right now". */
export async function getEventClaimState(
  redis: Redis,
  groupName: string,
  eventId: string
): Promise<EventClaimState> {
  const v = await redis.get(processedKey(groupName, eventId));
  if (v === '1') return 'processed';
  if (v === 'processing') return 'processing';
  return 'none';
}

export async function releaseEventClaim(redis: Redis, groupName: string, eventId: string): Promise<void> {
  const key = processedKey(groupName, eventId);
  const v = await redis.get(key);
  if (v === 'processing') await redis.del(key);
}
