import { describe, expect, it } from 'vitest';
import {
  TEST_CALL_COOLDOWN_MS,
  TEST_CALL_HOURLY_LIMIT,
  checkTestCallAllowed,
  normalizeTestCallNumber,
} from '../../../apps/gateway/src/services/onboarding/test-call-guard.js';

describe('normalizeTestCallNumber', () => {
  it('accepts international numbers however they are typed', () => {
    expect(normalizeTestCallNumber('+971 50 123 4567')).toBe('+971501234567');
    expect(normalizeTestCallNumber('00971-50-123-4567')).toBe('+971501234567');
    expect(normalizeTestCallNumber(' (+1) 646 798 1317 ')).toBe('+16467981317');
  });

  it('refuses a number without a country code', () => {
    expect(normalizeTestCallNumber('0501234567')).toBeNull();
    expect(normalizeTestCallNumber('501234567')).toBeNull();
  });

  it('refuses numbers that are too short, too long or start with 0 after the plus', () => {
    expect(normalizeTestCallNumber('+1234567')).toBeNull();
    expect(normalizeTestCallNumber('+1234567890123456')).toBeNull();
    expect(normalizeTestCallNumber('+0501234567')).toBeNull();
  });

  it('refuses empty or non-text input', () => {
    expect(normalizeTestCallNumber('')).toBeNull();
    expect(normalizeTestCallNumber(undefined)).toBeNull();
    expect(normalizeTestCallNumber({})).toBeNull();
  });
});

describe('checkTestCallAllowed', () => {
  const now = 10_000_000;

  it('allows the first call', () => {
    expect(checkTestCallAllowed([], now)).toEqual({ allowed: true });
  });

  it('makes the client wait a minute between calls', () => {
    const r = checkTestCallAllowed([now - 20_000], now);
    expect(r).toMatchObject({ allowed: false });
    expect(r.message).toContain('40 seconds');
    expect(checkTestCallAllowed([now - TEST_CALL_COOLDOWN_MS], now)).toEqual({ allowed: true });
  });

  it('stops after three calls in an hour, and says when to try again', () => {
    const calls = [now - 50 * 60_000, now - 30 * 60_000, now - 10 * 60_000];
    expect(calls).toHaveLength(TEST_CALL_HOURLY_LIMIT);
    const r = checkTestCallAllowed(calls, now);
    expect(r).toMatchObject({ allowed: false });
    expect(r.message).toContain('about 10 minutes');
  });

  it('forgets calls older than an hour', () => {
    const old = [now - 61 * 60_000, now - 62 * 60_000, now - 63 * 60_000, now - 64 * 60_000];
    expect(checkTestCallAllowed(old, now)).toEqual({ allowed: true });
  });
});
