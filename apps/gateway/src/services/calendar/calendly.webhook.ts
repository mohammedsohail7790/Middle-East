import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '../logger.js';

/** Verify Calendly-Webhook-Signature header (t=timestamp,v1=hex). */
export function verifyCalendlyWebhookSignature(
  rawBody: Buffer,
  header: string | undefined | null
): boolean {
  const secret = process.env.CALENDLY_WEBHOOK_SIGNING_KEY?.trim();
  if (!secret) {
    logger.warn('[Calendly] CALENDLY_WEBHOOK_SIGNING_KEY not set — refusing the webhook');
    return false;
  }
  if (!header) return false;

  const parts: Record<string, string> = {};
  for (const piece of header.split(',')) {
    const [k, v] = piece.trim().split('=');
    if (k && v) parts[k] = v;
  }

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  // A signed message is only good for a few minutes, so a captured one cannot be replayed later.
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestamp}.`);
  hmac.update(rawBody);
  const expected = hmac.digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}
