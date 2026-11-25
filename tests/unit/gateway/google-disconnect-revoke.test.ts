import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: { query: vi.fn() },
}));

import { calendarService, revokeGoogleToken } from '../../../apps/gateway/src/services/calendar/calendar.service.js';
import { voiceDb } from '../../../apps/gateway/src/services/voice/tenant-scope.js';

const query = voiceDb.query as unknown as ReturnType<typeof vi.fn>;
const writes = () => query.mock.calls.map((c) => String(c[0])).filter((q) => /^\s*UPDATE/i.test(q));

describe('disconnecting Google Calendar', () => {
  beforeEach(() => {
    query.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('revokes each stored token at Google, then deletes our copies', async () => {
    query.mockResolvedValueOnce({ rows: [{ token: 'refresh-1' }, { token: 'refresh-1' }, { token: 'access-1' }, { token: null }] });
    query.mockResolvedValue({ rows: [] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await calendarService.disconnect('tenant-1');

    const bodies = fetchMock.mock.calls.map((c) => String(c[1].body));
    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/revoke');
    expect(bodies.sort()).toEqual(['token=access-1', 'token=refresh-1']); // duplicates and nulls skipped
    const sql = writes().join('\n');
    expect(sql).toMatch(/access_token = NULL, refresh_token = NULL/);
    expect(sql).toMatch(/google_access_token = NULL, google_refresh_token = NULL/);
  });

  it('still deletes our copies when Google refuses or cannot be reached', async () => {
    query.mockResolvedValueOnce({ rows: [{ token: 'refresh-1' }, { token: 'access-1' }] });
    query.mockResolvedValue({ rows: [] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 400 }).mockRejectedValueOnce(new Error('network down')));

    await expect(calendarService.disconnect('tenant-1')).resolves.toBeUndefined();
    expect(writes().join('\n')).toMatch(/refresh_token = NULL/);
  });

  it('does not call Google when nothing is stored, but still marks it disconnected', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValue({ rows: [] });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await calendarService.disconnect('tenant-1');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(writes().join('\n')).toMatch(/status = 'disconnected'/);
  });
});

describe('revokeGoogleToken', () => {
  afterEach(() => vi.restoreAllMocks());
  it('reports false instead of throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(revokeGoogleToken('x')).resolves.toBe(false);
  });
});
