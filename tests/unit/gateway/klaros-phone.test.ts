/**
 * Klaros-driven phone numbers: the rules that decide what may be bought, for whom, and what is stored. Twilio and the database are not
 * contacted here (the real-database run is separate); these prove the validation, the cost acceptance and the cap.
 */
import { describe, it, expect } from 'vitest';
import {
  MONTHLY_COST_USD,
  KlarosPhoneError,
  monthlyPurchaseCap,
  normalizeE164,
  validatePhoneRequest,
} from '../../../apps/gateway/src/services/klaros/klaros-phone.service.js';

const T = '7c1d5a2e-3b4f-4a6d-9e8b-2f0a1c9d4e55';
const rejects = (body: unknown, re: RegExp) => {
  try {
    validatePhoneRequest(body);
  } catch (e) {
    expect(e).toBeInstanceOf(KlarosPhoneError);
    expect((e as Error).message).toMatch(re);
    return;
  }
  throw new Error('expected a rejection');
};

describe('normalising a phone number', () => {
  it('accepts E.164 and a bare 10-digit US number, and nothing else', () => {
    expect(normalizeE164('+1 (415) 555-0123')).toBe('+14155550123');
    expect(normalizeE164('415 555 0123')).toBe('+14155550123');
    expect(normalizeE164('+971 50 123 4567')).toBe('+971501234567');
    for (const bad of ['', 'abc', '123', '+0123456789', '911', '+1', undefined, null, 5551234567, '+1 415 555 0123 ext 5']) {
      expect(normalizeE164(bad as unknown)).toBeUndefined();
    }
  });
});

describe('the monthly purchase cap', () => {
  it('defaults to 5, is never negative, and never exceeds 50', () => {
    expect(monthlyPurchaseCap({})).toBe(5);
    expect(monthlyPurchaseCap({ KLAROS_PHONE_MONTHLY_CAP: '12' })).toBe(12);
    expect(monthlyPurchaseCap({ KLAROS_PHONE_MONTHLY_CAP: '0' })).toBe(0); // buying can be switched off
    expect(monthlyPurchaseCap({ KLAROS_PHONE_MONTHLY_CAP: '-3' })).toBe(5);
    expect(monthlyPurchaseCap({ KLAROS_PHONE_MONTHLY_CAP: 'lots' })).toBe(5);
    expect(monthlyPurchaseCap({ KLAROS_PHONE_MONTHLY_CAP: '9999' })).toBe(50);
  });
});

describe('the request body', () => {
  it('status needs only the business', () => {
    expect(validatePhoneRequest({ klarosTenantId: T.toUpperCase(), action: 'status' })).toEqual({ klarosTenantId: T, action: 'status' });
    rejects({ action: 'status' }, /klarosTenantId/);
    rejects({ klarosTenantId: 'nope', action: 'status' }, /UUID/);
  });

  it('refuses an unknown or missing action', () => {
    rejects({ klarosTenantId: T }, /Unknown action/);
    rejects({ klarosTenantId: T, action: 'release' }, /Unknown action/);
    rejects({ klarosTenantId: T, action: '__proto__' }, /Unknown action/);
  });

  it('search needs exactly a 3-digit area code', () => {
    expect(validatePhoneRequest({ klarosTenantId: T, action: 'search', areaCode: '415' }).areaCode).toBe('415');
    expect(validatePhoneRequest({ klarosTenantId: T, action: 'search', areaCode: '(919)' }).areaCode).toBe('919');
    rejects({ klarosTenantId: T, action: 'search', areaCode: '41' }, /3 digits/);
    rejects({ klarosTenantId: T, action: 'search' }, /3 digits/);
  });

  it('buy needs a real number from the search; the cost is carried so the service can require it be accepted', () => {
    const ok = validatePhoneRequest({ klarosTenantId: T, action: 'buy', phoneNumber: '+14155550123', acceptedMonthlyCostUsd: MONTHLY_COST_USD });
    expect(ok).toMatchObject({ phoneNumber: '+14155550123', acceptedMonthlyCostUsd: MONTHLY_COST_USD });
    // a missing or non-numeric acceptance is carried as undefined and refused by the service, never defaulted to "accepted"
    expect(validatePhoneRequest({ klarosTenantId: T, action: 'buy', phoneNumber: '+14155550123' }).acceptedMonthlyCostUsd).toBeUndefined();
    expect(validatePhoneRequest({ klarosTenantId: T, action: 'buy', phoneNumber: '+14155550123', acceptedMonthlyCostUsd: '1.15' }).acceptedMonthlyCostUsd).toBeUndefined();
    rejects({ klarosTenantId: T, action: 'buy', phoneNumber: 'call me' }, /search results/);
    rejects({ klarosTenantId: T, action: 'buy' }, /search results/);
  });

  it('the business number is optional, normalised, and removable', () => {
    expect(validatePhoneRequest({ klarosTenantId: T, action: 'set_business_number', businessNumber: '(415) 555-0123' }).businessNumber).toBe('+14155550123');
    expect(validatePhoneRequest({ klarosTenantId: T, action: 'set_business_number', businessNumber: null }).businessNumber).toBeNull();
    expect(validatePhoneRequest({ klarosTenantId: T, action: 'set_business_number', businessNumber: '' }).businessNumber).toBeNull();
    rejects({ klarosTenantId: T, action: 'set_business_number', businessNumber: '12345' }, /country code/);
  });

  it('quotes the same monthly price the purchase code records', () => {
    expect(MONTHLY_COST_USD).toBe(1.15);
  });
});
