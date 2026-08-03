import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { voiceRedis } from '../voice/redis.client.js';
import { logger } from '../logger.js';
import { logWsSessionEvent } from '../observability/validation-telemetry.js';

const NONCE_PREFIX = 'ws_nonce:';

export interface WsSessionClaims {
  sub: 'calliq-ws-session';
  tid: string;
  cs?: string;
  jti: string;
}

export interface IssueWsSessionInput {
  tenantId: string;
  callSid?: string;
  agentId?: string | null;
}

function sessionSecret(): string {
  const secret =
    process.env.WS_SESSION_SECRET ||
    process.env.JWT_SECRET ||
    process.env.VOICE_INTERNAL_API_KEY;
  if (!secret) {
    throw new Error(
      '[STARTUP] WS_SESSION_SECRET (or JWT_SECRET / VOICE_INTERNAL_API_KEY) must be set. ' +
      'Refusing to sign WebSocket session tokens with an insecure fallback.'
    );
  }
  return secret;
}

export function assertWsSessionSecret(): void {
  sessionSecret(); // throws if not set
  process.stdout.write('[ws-session-tokens] secret configured\n');
}

function ttlSec(): number {
  return Number(process.env.WS_SESSION_TTL_SEC || 7200);
}

function replayGuardEnabled(): boolean {
  return (process.env.WS_NONCE_REPLAY_GUARD || 'true').toLowerCase() !== 'false';
}

export async function issueWsSessionToken(input: IssueWsSessionInput): Promise<string> {
  const jti = randomBytes(16).toString('hex');
  const claims: WsSessionClaims = {
    sub: 'calliq-ws-session',
    tid: input.tenantId,
    jti,
  };
  if (input.callSid) claims.cs = input.callSid;

  const exp = Math.floor(Date.now() / 1000) + ttlSec();
  const token = jwt.sign({ ...claims, exp }, sessionSecret());

  try {
    await voiceRedis.setex(`${NONCE_PREFIX}${jti}`, ttlSec(), input.tenantId);
  } catch (err) {
    logger.warn('WS_SESSION_NONCE_REDIS_FAILED', { error: String(err) });
  }

  logWsSessionEvent('token_issued', {
    tenantId: input.tenantId,
    callSid: input.callSid,
    jti,
    ttlSec: ttlSec(),
  });

  return token;
}

export async function verifyWsSessionToken(
  token: string,
  expected: { tenantId: string; callSid?: string },
  options?: { consumeNonce?: boolean }
): Promise<boolean> {
  if (!token?.trim()) return false;

  try {
    const decoded = jwt.verify(token, sessionSecret()) as WsSessionClaims;
    if (decoded.sub !== 'calliq-ws-session') return false;
    if (decoded.tid !== expected.tenantId) return false;
    if (expected.callSid && decoded.cs && decoded.cs !== expected.callSid) return false;
    if (expected.callSid && !decoded.cs) return false;

    if (replayGuardEnabled() && decoded.jti) {
      const key = `${NONCE_PREFIX}${decoded.jti}`;
      let exists: string | null = null;
      let redisUnavailable = false;
      try {
        exists = await voiceRedis.get(key);
      } catch (err) {
        redisUnavailable = true;
        logger.warn('WS_SESSION_NONCE_REDIS_READ_FAILED', {
          error: String(err),
          tenantId: expected.tenantId,
          callSid: expected.callSid,
        });
      }
      if (!exists && !redisUnavailable) {
        logWsSessionEvent('nonce_missing', {
          tenantId: expected.tenantId,
          callSid: expected.callSid,
          jti: decoded.jti,
          consumeNonce: options?.consumeNonce !== false,
        });
        return false;
      }
      if (!exists && redisUnavailable) {
        // Fail closed — reject tokens when Redis is down to prevent replay attacks
        logWsSessionEvent('nonce_rejected_redis_down', {
          tenantId: expected.tenantId,
          callSid: expected.callSid,
          jti: decoded.jti,
        });
        return false;
      }
      if (options?.consumeNonce !== false) {
        await voiceRedis.del(key).catch(() => undefined);
        logWsSessionEvent('nonce_consumed', {
          tenantId: expected.tenantId,
          callSid: expected.callSid,
          jti: decoded.jti,
        });
      } else {
        logWsSessionEvent('nonce_checked', {
          tenantId: expected.tenantId,
          callSid: expected.callSid,
          jti: decoded.jti,
        });
      }
    }

    logWsSessionEvent('token_verified', {
      tenantId: expected.tenantId,
      callSid: expected.callSid,
      jti: decoded.jti,
    });
    return true;
  } catch (err) {
    logWsSessionEvent('token_rejected', {
      tenantId: expected.tenantId,
      callSid: expected.callSid,
      reason: err instanceof Error ? err.message : 'verify_failed',
    });
    return false;
  }
}
