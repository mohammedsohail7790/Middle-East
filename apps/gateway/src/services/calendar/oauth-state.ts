import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Signed `state` for the calendar connect flows (Google, Outlook, Calendly, Acuity, Square).
 * The callbacks are public (the provider redirects the browser back), so the state is the only thing that says which workspace a connection belongs to. It must not be something an outsider can write: it is the workspace id, a random value and an expiry, signed with the server secret.
 * It is stateless, so it works on several instances; it is valid for 10 minutes.
 */
const MAX_AGE_SECONDS = 10 * 60;

function secret(): string {
  const s = process.env.OAUTH_STATE_SECRET?.trim() || process.env.JWT_SECRET?.trim() || '';
  if (!s) throw new Error('A signing secret is required for calendar connections (JWT_SECRET).');
  return s;
}

const sign = (body: string) => createHmac('sha256', secret()).update(`calendar-oauth-state.${body}`).digest();

export function signOAuthState(tenantId: string, nowMs: number = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ t: tenantId, n: randomBytes(8).toString('hex'), x: Math.floor(nowMs / 1000) + MAX_AGE_SECONDS })).toString('base64url');
  return `${body}.${sign(body).toString('base64url')}`;
}

/** Returns the workspace id a valid, unexpired state was issued for, or null for anything else (missing, changed, expired, or the old unsigned kind). */
export function verifyOAuthState(state: unknown, nowMs: number = Date.now()): string | null {
  if (typeof state !== 'string' || state.length < 20 || state.length > 1000) return null;
  const parts = state.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = sign(parts[0]);
  let given: Buffer;
  try {
    given = Buffer.from(parts[1], 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { t?: unknown; x?: unknown };
    if (typeof p.t !== 'string' || !p.t || typeof p.x !== 'number' || p.x * 1000 <= nowMs) return null;
    return p.t;
  } catch {
    return null;
  }
}
