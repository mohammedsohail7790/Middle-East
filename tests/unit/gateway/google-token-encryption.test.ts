import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.INTEGRATION_CREDENTIALS_KEY = randomBytes(32).toString('base64');
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: { query: vi.fn() },
}));

import {
  GOOGLE_TOKEN_PREFIX,
  decryptGoogleToken,
  decryptGoogleTokenOrEmpty,
  encryptGoogleToken,
  isEncryptedGoogleToken,
} from '../../../apps/gateway/src/services/calendar/google-token-crypto.js';
import { mapGoogleCalendarConnectionRow } from '../../../apps/gateway/src/services/calendar/calendar-connection-map.js';
import { calendarService } from '../../../apps/gateway/src/services/calendar/calendar.service.js';
import { voiceDb } from '../../../apps/gateway/src/services/voice/tenant-scope.js';

const query = voiceDb.query as unknown as ReturnType<typeof vi.fn>;

describe('Google token encryption helper', () => {
  it('stores a token as an encrypted value that does not contain the token, and reads it back', () => {
    const enc = encryptGoogleToken('ya29.secret-access-token');
    expect(enc).toMatch(new RegExp(`^${GOOGLE_TOKEN_PREFIX}`));
    expect(enc).not.toContain('ya29.secret-access-token');
    expect(isEncryptedGoogleToken(enc)).toBe(true);
    expect(decryptGoogleToken(enc)).toBe('ya29.secret-access-token');
  });

  it('gives a different encrypted value each time (random IV) and never encrypts twice', () => {
    const a = encryptGoogleToken('same-token');
    const b = encryptGoogleToken('same-token');
    expect(a).not.toBe(b);
    expect(encryptGoogleToken(a)).toBe(a);
  });

  it('treats empty values as nothing to store', () => {
    expect(encryptGoogleToken(null)).toBeNull();
    expect(encryptGoogleToken(undefined)).toBeNull();
    expect(encryptGoogleToken('   ')).toBeNull();
    expect(decryptGoogleToken(null)).toBe('');
  });

  it('still reads an old plain-text token as it is', () => {
    expect(isEncryptedGoogleToken('1//plain-refresh-token')).toBe(false);
    expect(decryptGoogleToken('1//plain-refresh-token')).toBe('1//plain-refresh-token');
  });

  it('gives an empty token, and a warning without the value, when the stored value cannot be decrypted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const damaged = `${GOOGLE_TOKEN_PREFIX}AAAA.BBBB.CCCC`;
    expect(() => decryptGoogleToken(damaged)).toThrow();
    expect(decryptGoogleTokenOrEmpty(damaged)).toBe('');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('AAAA.BBBB.CCCC');
    warn.mockRestore();
  });

  it('maps a connection row with encrypted tokens, and one with old plain-text tokens', () => {
    const base = { id: 'c1', tenant_id: 't1', email: 'a@b.com', expires_at: '2026-11-26T10:00:00Z', status: 'active' };
    const encrypted = mapGoogleCalendarConnectionRow({
      ...base,
      access_token: encryptGoogleToken('access-1'),
      refresh_token: encryptGoogleToken('refresh-1'),
    });
    expect(encrypted.accessToken).toBe('access-1');
    expect(encrypted.refreshToken).toBe('refresh-1');
    const legacy = mapGoogleCalendarConnectionRow({ ...base, access_token: 'old-access', refresh_token: 'old-refresh' });
    expect(legacy.accessToken).toBe('old-access');
    expect(legacy.refreshToken).toBe('old-refresh');
  });
});

describe('Google Calendar connect and disconnect with encrypted tokens', () => {
  beforeEach(() => {
    query.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('never writes a plain-text Google token to the database when connecting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'ya29.live-access', refresh_token: '1//live-refresh', expires_in: 3600 }),
      })
    );
    const written: unknown[][] = [];
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      written.push(params);
      if (/INSERT INTO public\.calendar_connections/i.test(sql)) {
        return { rows: [{ id: 'c1', tenant_id: 't1', email: 'x@y.com', access_token: params[2], refresh_token: params[3], expires_at: new Date(), status: 'active' }] };
      }
      return { rows: [] };
    });

    const connection = await calendarService.handleGoogleCallback('tenant-1', 'auth-code');

    const everyValueWritten = JSON.stringify(written);
    expect(everyValueWritten).not.toContain('ya29.live-access');
    expect(everyValueWritten).not.toContain('1//live-refresh');
    expect(everyValueWritten).toContain(GOOGLE_TOKEN_PREFIX);
    // the caller still gets usable tokens
    expect(connection.accessToken).toBe('ya29.live-access');
    expect(connection.refreshToken).toBe('1//live-refresh');
  });

  it('revokes the real tokens at Google when the stored copies are encrypted', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { token: encryptGoogleToken('refresh-real') },
        { token: encryptGoogleToken('refresh-real') },
        { token: encryptGoogleToken('access-real') },
        { token: 'plain-old-token' },
        { token: null },
      ],
    });
    query.mockResolvedValue({ rows: [] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await calendarService.disconnect('tenant-1');

    const bodies = fetchMock.mock.calls.map((c) => String(c[1].body)).sort();
    expect(bodies).toEqual(['token=access-real', 'token=plain-old-token', 'token=refresh-real']);
  });

  it('still deletes our copies when a stored token cannot be decrypted', async () => {
    query.mockResolvedValueOnce({ rows: [{ token: `${GOOGLE_TOKEN_PREFIX}AAAA.BBBB.CCCC` }] });
    query.mockResolvedValue({ rows: [] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await calendarService.disconnect('tenant-1');

    expect(fetchMock).not.toHaveBeenCalled();
    const sql = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toMatch(/access_token = NULL, refresh_token = NULL/);
    expect(sql).toMatch(/google_access_token = NULL, google_refresh_token = NULL/);
  });
});
