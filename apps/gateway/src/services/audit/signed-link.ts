import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Private links for the paid audit. There is no account and no database: a link is a small signed message that says who it is for, what it opens and when it stops working.
 * Two kinds: `form2` opens the audit questionnaire (after the NDA), and `pay` opens the payment page (sent with the "audit ready" email, valid for 5 days).
 * The signature uses AUDIT_LINK_SECRET, so a link cannot be forged or changed; changing the secret switches every link off at once.
 */
export type LinkKind = 'form2' | 'pay';

export interface LinkPayload {
  /** Kind of link. */
  k: LinkKind;
  /** Random id, shown in emails so an order can be recognised. */
  id: string;
  company: string;
  /** The client's email, used to pre-fill the payment and to say who the link is for. */
  email: string;
  /** Expiry, seconds since 1970. */
  x: number;
  /** Currency for a payment link (AED, SAR, ...). */
  cur?: string;
}

export type VerifyResult =
  | { ok: true; payload: LinkPayload }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' };

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');
const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest();

export function signLink(payload: LinkPayload, secret: string): string {
  if (!secret) throw new Error('A signing secret is required.');
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(sign(body, secret))}`;
}

export function verifyLink(token: string, secret: string, nowMs: number = Date.now()): VerifyResult {
  if (typeof token !== 'string' || token.length < 20 || token.length > 2000 || !secret) return { ok: false, reason: 'malformed' };
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return { ok: false, reason: 'malformed' };
  const expected = sign(body, secret);
  let given: Buffer;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad-signature' };
  let p: LinkPayload;
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LinkPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const valid =
    p && (p.k === 'form2' || p.k === 'pay') && typeof p.id === 'string' && typeof p.company === 'string' && typeof p.email === 'string' && typeof p.x === 'number' && Number.isFinite(p.x) &&
    (p.cur === undefined || typeof p.cur === 'string');
  if (!valid) return { ok: false, reason: 'malformed' };
  if (p.x * 1000 <= nowMs) return { ok: false, reason: 'expired' };
  return { ok: true, payload: p };
}
