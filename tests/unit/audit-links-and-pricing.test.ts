import { describe, expect, it } from 'vitest';
import { signLink, verifyLink } from '../../apps/gateway/src/services/audit/signed-link.js';
import { auditPrices, minorUnits } from '../../apps/gateway/src/services/audit/audit-pricing.js';

const secret = 'test-secret-at-least-long-enough';
const now = Date.UTC(2026, 10, 1);
const payload = { k: 'form2' as const, id: 'a1', company: 'Smith & Co', email: 'j@example.com', x: Math.floor(now / 1000) + 3600 };

describe('signed links', () => {
  it('round-trips a valid link', () => {
    const r = verifyLink(signLink(payload, secret), secret, now) as any;
    expect(r.ok).toBe(true);
    expect(r.payload.company).toBe('Smith & Co');
  });
  it('rejects an expired link', () => {
    expect((verifyLink(signLink(payload, secret), secret, now + 7200 * 1000) as any).reason).toBe('expired');
  });
  it('rejects a tampered body and a wrong secret', () => {
    const [body, sig] = signLink(payload, secret).split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, company: 'Other' })).toString('base64url');
    expect((verifyLink(`${forged}.${sig}`, secret, now) as any).reason).toBe('bad-signature');
    expect((verifyLink(`${body}.${sig}`, 'another-secret-value-here', now) as any).reason).toBe('bad-signature');
  });
  it('rejects junk', () => {
    expect(verifyLink('nonsense', secret, now).ok).toBe(false);
    expect(verifyLink('', secret, now).ok).toBe(false);
  });
});

describe('audit pricing', () => {
  it('defaults to 5,000 AED only', () => {
    expect(auditPrices({} as any)).toEqual({ AED: 5000 });
  });
  it('adds prices from the setting and ignores bad ones', () => {
    expect(auditPrices({ AUDIT_PRICES_JSON: '{"SAR":5100,"OMR":-1,"XXX":5}' } as any)).toEqual({ AED: 5000, SAR: 5100 });
    expect(auditPrices({ AUDIT_PRICES_JSON: 'not json' } as any)).toEqual({ AED: 5000 });
  });
  it('converts to minor units, with a trailing zero for three-decimal currencies', () => {
    expect(minorUnits('AED', 5000)).toBe(500000);
    expect(minorUnits('OMR', 520)).toBe(520000);
    expect(minorUnits('KWD', 410.5)).toBe(410500);
  });
});
