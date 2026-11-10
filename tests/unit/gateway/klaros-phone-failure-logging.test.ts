/**
 * When a number search or purchase fails, the real reason must reach the log (name, Twilio code, HTTP status, a cleaned message), because the owner only ever sees
 * "we could not search for numbers just now". Secrets and phone numbers never reach the log, and the caller still gets the same generic message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  searchAvailable: vi.fn(),
}));

vi.mock('../../../apps/gateway/src/services/logger.js', () => ({
  logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/phone-provisioning/phoneProvisioning.service.js', () => ({
  isTwilioConfigured: () => true,
  isGatewayReadyForTwilio: () => true,
  PhoneProvisioningService: class {
    searchAvailable = mocks.searchAvailable;
  },
}));

import { KlarosPhoneError, describePhoneError, searchNumbers } from '../../../apps/gateway/src/services/klaros/klaros-phone.service.js';

describe('describePhoneError', () => {
  it('keeps the error name, Twilio code and HTTP status', () => {
    const err = Object.assign(new Error('Authenticate'), { name: 'RestException', code: 20003, status: 401 });
    expect(describePhoneError(err)).toEqual({ errorName: 'RestException', errorCode: 20003, errorStatus: 401, errorMessage: 'Authenticate' });
  });

  it('reads statusCode as well as status', () => {
    expect(describePhoneError(Object.assign(new Error('x'), { statusCode: 429 })).errorStatus).toBe(429);
  });

  it('removes account ids, long tokens, auth headers and phone numbers from the message', () => {
    const secret = 'a'.repeat(40);
    const message = `Invalid credentials for AC${'0123456789abcdef'.repeat(2)} using ${secret}; Bearer sk_live_abcdef; calling +14155550123`;
    const out = describePhoneError(new Error(message)).errorMessage!;
    expect(out).not.toMatch(/AC[0-9a-f]{32}/);
    expect(out).not.toContain(secret);
    expect(out).not.toContain('sk_live_abcdef');
    expect(out).not.toContain('+14155550123');
    expect(out).toContain('[sid]');
    expect(out).toContain('[number]');
  });

  it('cuts a long message short and copes with things that are not errors', () => {
    expect(describePhoneError(new Error('x'.repeat(1000))).errorMessage!.length).toBe(240);
    expect(describePhoneError(undefined)).toEqual({ errorName: 'unknown' });
    expect(describePhoneError('boom')).toEqual({ errorName: 'unknown' });
    expect(describePhoneError({})).toEqual({ errorName: 'Error' });
  });
});

describe('a failed number search', () => {
  beforeEach(() => {
    mocks.warn.mockReset();
    mocks.searchAvailable.mockReset();
  });

  it('logs the real reason and still gives the caller the same generic message', async () => {
    mocks.searchAvailable.mockRejectedValue(Object.assign(new Error('Authenticate'), { name: 'RestException', code: 20003, status: 401 }));
    const failure = await searchNumbers('212').catch((e) => e);
    expect(failure).toBeInstanceOf(KlarosPhoneError);
    expect((failure as Error).message).toBe('We could not search for numbers just now.'); // what the owner sees is unchanged
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    const [event, context] = mocks.warn.mock.calls[0];
    expect(event).toBe('KLAROS_PHONE_SEARCH_FAILED');
    expect(context).toMatchObject({ areaCode: '212', errorName: 'RestException', errorCode: 20003, errorStatus: 401, errorMessage: 'Authenticate' });
  });

  it('does not log anything when the search works', async () => {
    mocks.searchAvailable.mockResolvedValue([{ phoneNumber: '+12125550100', friendlyName: '(212) 555-0100' }]);
    const out = await searchNumbers('212');
    expect(out.numbers).toEqual([{ phoneNumber: '+12125550100', friendlyName: '(212) 555-0100' }]);
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
