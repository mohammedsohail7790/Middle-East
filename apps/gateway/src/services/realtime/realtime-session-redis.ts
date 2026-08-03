import { voiceRedis } from '../voice/redis.client.js';
import { logger } from '../logger.js';
import type { CallRuntimeSession, TranscriptChunk } from './realtime-session.js';

const PREFIX = 'v4_rt_session:';
const TTL_SEC = Number(process.env.P1_REDIS_SESSION_TTL_SEC || 7200);

export interface RuntimeSessionSnapshot {
  sessionId: string;
  tenantId: string;
  callSid: string;
  state: string;
  voiceSessionId?: string;
  reconnectCount: number;
  lastHeartbeatAt: number;
  transcriptBuffer: TranscriptChunk[];
  updatedAt: number;
}

function key(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

export async function saveRuntimeSessionSnapshot(
  session: CallRuntimeSession
): Promise<void> {
  const snapshot: RuntimeSessionSnapshot = {
    sessionId: session.sessionId,
    tenantId: session.tenantId,
    callSid: session.callSid,
    state: session.state,
    voiceSessionId: session.voiceSessionId,
    reconnectCount: session.metrics.reconnectCount,
    lastHeartbeatAt: session.lastHeartbeatAt,
    transcriptBuffer: session.transcriptBuffer.slice(-200),
    updatedAt: session.updatedAt,
  };
  try {
    await voiceRedis.set(key(session.sessionId), JSON.stringify(snapshot), 'EX', TTL_SEC);
    await voiceRedis.set(
      `${PREFIX}call:${session.callSid}`,
      session.sessionId,
      'EX',
      TTL_SEC
    );
  } catch (err) {
    logger.debug('RUNTIME_SESSION_REDIS_SAVE_FAILED', {
      sessionId: session.sessionId,
      error: String(err),
    });
  }
}

export async function loadRuntimeSessionIdByCallSid(
  callSid: string
): Promise<string | null> {
  try {
    return await voiceRedis.get(`${PREFIX}call:${callSid}`);
  } catch {
    return null;
  }
}

export async function loadRuntimeSessionSnapshot(
  sessionId: string
): Promise<RuntimeSessionSnapshot | null> {
  try {
    const raw = await voiceRedis.get(key(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as RuntimeSessionSnapshot;
  } catch {
    return null;
  }
}

export async function deleteRuntimeSessionRedis(sessionId: string, callSid: string): Promise<void> {
  try {
    await voiceRedis.del(key(sessionId), `${PREFIX}call:${callSid}`);
  } catch {
    /* ignore */
  }
}
