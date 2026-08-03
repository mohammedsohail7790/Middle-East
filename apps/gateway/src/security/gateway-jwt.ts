import jwt from 'jsonwebtoken';
import { voiceRedis } from '../services/voice/redis.client.js';

const REVOKED_PREFIX = 'jwt_refresh_revoked:';

type GatewayJwtClaims = {
  sub: string;
  tenant_id: string;
  type: 'access' | 'refresh';
  jti?: string;
  exp: number;
};

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not configured');
  return s;
}

function accessTtlSec(): number {
  const raw = process.env.JWT_ACCESS_TTL_SEC;
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  return 15 * 60;
}

function refreshTtlSec(): number {
  const raw = process.env.JWT_REFRESH_TTL_SEC;
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  return 7 * 24 * 60 * 60;
}

export function signGatewayAccessToken(payload: { sub: string; tenant_id: string }): string {
  const exp = Math.floor(Date.now() / 1000) + accessTtlSec();
  return jwt.sign({ ...payload, type: 'access', exp }, secret());
}

export function signGatewayRefreshToken(payload: { sub: string; tenant_id: string; jti: string }): string {
  const exp = Math.floor(Date.now() / 1000) + refreshTtlSec();
  return jwt.sign({ ...payload, type: 'refresh', exp }, secret());
}

export async function revokeRefreshToken(jti: string): Promise<void> {
  const ttlSec = refreshTtlSec();
  try {
    await voiceRedis.setex(`${REVOKED_PREFIX}${jti}`, ttlSec, '1');
  } catch {
    /* best-effort */
  }
}

export async function isRefreshTokenRevoked(jti: string): Promise<boolean> {
  try {
    const v = await voiceRedis.get(`${REVOKED_PREFIX}${jti}`);
    return v === '1';
  } catch {
    return false;
  }
}

export function verifyGatewayToken(
  token: string,
  expectedType: 'access' | 'refresh'
): GatewayJwtClaims | null {
  try {
    const decoded = jwt.verify(token, secret()) as GatewayJwtClaims;
    if (decoded.type !== expectedType) return null;
    return decoded;
  } catch {
    return null;
  }
}
