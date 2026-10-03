import { describe, it, expect } from 'vitest';
import {
  signWebhookPayload,
  verifyWebhookSignature,
} from '../../../apps/gateway/src/security/webhook-signing.js';

describe('klaros webhook signing', () => {
  const secret = 'test-secret';
  const body = JSON.stringify({ id: 'evt_1', type: 'call.completed', data: {} });

  it('accepts a valid signature', () => {
    const now = Math.floor(Date.now() / 1000);
    const ts = String(now);
    const sig = signWebhookPayload(secret, ts, body);
    const result = verifyWebhookSignature({
      secret,
      timestamp: ts,
      rawBody: body,
      signatureHeader: `sha256=${sig}`,
      now,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a modified body', () => {
    const now = Math.floor(Date.now() / 1000);
    const ts = String(now);
    const sig = signWebhookPayload(secret, ts, body);
    const result = verifyWebhookSignature({
      secret,
      timestamp: ts,
      rawBody: body + 'tampered',
      signatureHeader: `sha256=${sig}`,
      now,
    });
    expect(result).toEqual({ valid: false, reason: 'signature_mismatch' });
  });

  it('rejects an invalid signature', () => {
    const now = Math.floor(Date.now() / 1000);
    const result = verifyWebhookSignature({
      secret,
      timestamp: String(now),
      rawBody: body,
      signatureHeader: 'sha256=' + '0'.repeat(64),
      now,
    });
    expect(result).toEqual({ valid: false, reason: 'signature_mismatch' });
  });

  it('rejects a malformed signature header', () => {
    const now = Math.floor(Date.now() / 1000);
    const result = verifyWebhookSignature({
      secret,
      timestamp: String(now),
      rawBody: body,
      signatureHeader: 'not-a-signature',
      now,
    });
    expect(result).toEqual({ valid: false, reason: 'malformed_signature' });
  });

  it('rejects a stale timestamp (replay protection)', () => {
    const now = Math.floor(Date.now() / 1000);
    const staleTs = String(now - 10 * 60); // 10 minutes old
    const sig = signWebhookPayload(secret, staleTs, body);
    const result = verifyWebhookSignature({
      secret,
      timestamp: staleTs,
      rawBody: body,
      signatureHeader: `sha256=${sig}`,
      now,
    });
    expect(result).toEqual({ valid: false, reason: 'stale_timestamp' });
  });

  it('rejects a future timestamp beyond tolerance (replay protection)', () => {
    const now = Math.floor(Date.now() / 1000);
    const futureTs = String(now + 10 * 60);
    const sig = signWebhookPayload(secret, futureTs, body);
    const result = verifyWebhookSignature({
      secret,
      timestamp: futureTs,
      rawBody: body,
      signatureHeader: `sha256=${sig}`,
      now,
    });
    expect(result).toEqual({ valid: false, reason: 'stale_timestamp' });
  });

  it('rejects a non-numeric timestamp', () => {
    const result = verifyWebhookSignature({
      secret,
      timestamp: 'not-a-number',
      rawBody: body,
      signatureHeader: 'sha256=abc',
    });
    expect(result).toEqual({ valid: false, reason: 'invalid_timestamp' });
  });
});
