import { timingSafeEqual } from 'crypto';
import { voiceRedis } from './redis.client.js';
import { issueWsSessionToken, verifyWsSessionToken } from '../auth/ws-session-tokens.js';

const PREFIX = 'call_stream_auth:';

/** In-process fallback when Redis is slow/unavailable (Twilio connects within seconds of webhook) */
const memoryTokens = new Map<string, { token: string; tenantId: string; agentId: string | null; expiresAt: number }>();

const MEMORY_TTL_MS = 7200_000;

function memoryKey(callSid: string): string {
  return callSid;
}

function setMemoryToken(callSid: string, token: string, tenantId: string, agentId?: string | null): void {
  memoryTokens.set(memoryKey(callSid), {
    token,
    tenantId,
    agentId: agentId || null,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
}

function getMemoryToken(callSid: string): { token: string; tenantId: string; agentId: string | null } | null {
  const row = memoryTokens.get(memoryKey(callSid));
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    memoryTokens.delete(memoryKey(callSid));
    return null;
  }
  return row;
}

export async function issueStreamAuthToken(callSid: string, tenantId: string, agentId?: string): Promise<string> {
  const payload = JSON.stringify({ tenantId, agentId: agentId || null });
  const signed = await issueWsSessionToken({ tenantId, callSid, agentId });

  setMemoryToken(callSid, signed, tenantId, agentId);

  try {
    await Promise.all([
      voiceRedis.setex(`${PREFIX}${callSid}`, 7200, signed),
      voiceRedis.setex(`call_stream:${callSid}`, 7200, tenantId),
      voiceRedis.setex(`call_stream_meta:${callSid}`, 7200, payload),
    ]);
  } catch {
    /* Redis optional at issue time — memory fallback is enough for Twilio's quick connect */
  }

  return signed;
}

export async function verifyStreamAuthToken(callSid: string, token: string, tenantId: string): Promise<boolean> {
  if (!callSid || !token) return false;

  if (
    await verifyWsSessionToken(
      token,
      { tenantId, callSid },
      { consumeNonce: false }
    )
  ) {
    return true;
  }

  const mem = getMemoryToken(callSid);
  if (mem) {
    const a = Buffer.from(mem.token);
    const b = Buffer.from(token);
    if (a.length === b.length && timingSafeEqual(a, b) && mem.tenantId === tenantId) {
      return true;
    }
  }

  try {
    const expected = await voiceRedis.get(`${PREFIX}${callSid}`);
    if (!expected) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
    const registeredTenant = await voiceRedis.get(`call_stream:${callSid}`);
    return registeredTenant === tenantId;
  } catch {
    return mem !== null && mem.tenantId === tenantId && timingSafeEqual(Buffer.from(mem.token), Buffer.from(token));
  }
}

export async function getStreamMeta(callSid: string): Promise<{ tenantId: string; agentId: string | null } | null> {
  const mem = getMemoryToken(callSid);
  if (mem) {
    return { tenantId: mem.tenantId, agentId: mem.agentId };
  }

  const raw = await voiceRedis.get(`call_stream_meta:${callSid}`).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { tenantId: string; agentId: string | null };
  } catch {
    return null;
  }
}
