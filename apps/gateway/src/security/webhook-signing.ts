import { createHmac, timingSafeEqual } from 'crypto';

/** Max clock skew tolerated between signing and verification (replay window). */
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/**
 * Signs a webhook body over `${timestamp}.${rawBody}` so the signature covers
 * both the payload and a replay-resistant timestamp — not just tenant/time
 * metadata. Returns the raw hex digest; callers prefix it as `sha256=<hex>`
 * for the X-HallaAI-Signature header.
 */
export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export interface VerifyWebhookSignatureInput {
  secret: string;
  timestamp: string;
  rawBody: string;
  signatureHeader: string; // e.g. "sha256=<hex>"
  toleranceSeconds?: number;
  now?: number;
}

export type VerifyWebhookSignatureResult =
  | { valid: true }
  | { valid: false; reason: 'malformed_signature' | 'invalid_timestamp' | 'stale_timestamp' | 'signature_mismatch' };

/**
 * Reference verifier, covered by this repo's own tests to prove the signing
 * scheme is correct and replay-resistant. Klaros performs its own
 * independent verification without any access to this codebase or database.
 */
export function verifyWebhookSignature(input: VerifyWebhookSignatureInput): VerifyWebhookSignatureResult {
  const match = /^sha256=([0-9a-f]+)$/i.exec(input.signatureHeader?.trim() || '');
  if (!match) return { valid: false, reason: 'malformed_signature' };

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return { valid: false, reason: 'invalid_timestamp' };

  const now = input.now ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - ts) > tolerance) return { valid: false, reason: 'stale_timestamp' };

  const expected = signWebhookPayload(input.secret, input.timestamp, input.rawBody);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(match[1], 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: 'signature_mismatch' };
  }
  return { valid: true };
}
