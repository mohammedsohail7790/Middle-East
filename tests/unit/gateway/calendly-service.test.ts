import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.mock('node-fetch', () => ({ default: (...a: unknown[]) => fetchMock(...a) }));

const poolQuery = vi.fn();
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) } }));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  calendlyService,
  CalendlyApiError,
  calendlyUriId,
} from '../../../apps/gateway/src/services/calendar/calendly.service.js';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
const fail = (status: number, text = 'nope') => ({ ok: false, status, json: async () => ({}), text: async () => text });

const EVENT_TYPE = { uri: 'https://api.calendly.com/event_types/ET1', name: 'Consult', durationMinutes: 30 };
const farFuture = () => new Date(Date.now() + 3 * 24 * 3600 * 1000);

function connectionRow(over: Record<string, unknown> = {}) {
  return {
    rows: [
      {
        id: 'c1',
        tenant_id: 't1',
        email: 'owner@x.com',
        access_token: 'tok',
        refresh_token: 'ref',
        expires_at: new Date(Date.now() + 3600_000),
        metadata: { organizationUri: 'org', userUri: 'user' },
        ...over,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  poolQuery.mockReset();
  poolQuery.mockResolvedValue(connectionRow());
});

describe('calendlyUriId', () => {
  it('returns the trailing id', () => {
    expect(calendlyUriId('https://api.calendly.com/scheduled_events/ABC')).toBe('ABC');
    expect(calendlyUriId('ABC')).toBe('ABC');
  });
});

describe('getSchedulingEventType', () => {
  it('picks the first active, non-secret event type with its duration', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        collection: [
          { uri: 'u/secret', secret: true, active: true, name: 'S', duration: 15 },
          { uri: 'u/off', active: false, name: 'O', duration: 15 },
          { uri: 'u/good', active: true, name: 'Good', duration: 45 },
        ],
      })
    );
    const et = await calendlyService.getSchedulingEventType('t1');
    expect(et).toEqual({ uri: 'u/good', name: 'Good', durationMinutes: 45 });
  });

  it('returns null when there are no event types', async () => {
    fetchMock.mockResolvedValueOnce(ok({ collection: [] }));
    expect(await calendlyService.getSchedulingEventType('t1')).toBeNull();
  });
});

describe('getAvailableTimes', () => {
  it('queries event_type_available_times and maps open slots', async () => {
    const s1 = new Date(Date.now() + 86400_000).toISOString();
    const s2 = new Date(Date.now() + 2 * 86400_000).toISOString();
    fetchMock.mockResolvedValueOnce(
      ok({
        collection: [
          { status: 'available', start_time: s2 },
          { status: 'available', start_time: s1 },
          { status: 'unavailable', start_time: s1 },
        ],
      })
    );
    const slots = await calendlyService.getAvailableTimes('t1', EVENT_TYPE, new Date(), farFuture());
    expect(slots.map((s) => s.start.toISOString())).toEqual([s1, s2]);
    expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(30 * 60_000);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/event_type_available_times?');
    expect(url).toContain(encodeURIComponent(EVENT_TYPE.uri));
    expect((fetchMock.mock.calls[0][1] as any).headers.Authorization).toBe('Bearer tok');
  });

  it('chunks ranges longer than 7 days', async () => {
    fetchMock.mockResolvedValue(ok({ collection: [] }));
    await calendlyService.getAvailableTimes(
      't1',
      EVENT_TYPE,
      new Date(),
      new Date(Date.now() + 10 * 86400_000)
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws CalendlyApiError with status on API failure', async () => {
    fetchMock.mockResolvedValueOnce(fail(403, 'plan'));
    await expect(
      calendlyService.getAvailableTimes('t1', EVENT_TYPE, new Date(), farFuture())
    ).rejects.toMatchObject({ status: 403, isAccessDenied: true });
  });
});

describe('createBooking', () => {
  const input = {
    eventType: EVENT_TYPE,
    start: farFuture(),
    name: 'Jane',
    email: 'jane@x.com',
    phone: '+15551234567',
    timezone: 'America/New_York',
  };

  it('POSTs /invitees and returns the event uri', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ resource: { uri: 'https://api.calendly.com/scheduled_events/E1/invitees/I1', event: 'https://api.calendly.com/scheduled_events/E1' } })
    );
    const r = await calendlyService.createBooking('t1', input);
    expect(r.eventUri).toBe('https://api.calendly.com/scheduled_events/E1');
    const [url, opts] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe('https://api.calendly.com/invitees');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.event_type).toBe(EVENT_TYPE.uri);
    expect(body.invitee).toEqual({ name: 'Jane', email: 'jane@x.com', timezone: 'America/New_York' });
    expect(body.text_reminder_number).toBe('+15551234567');
  });

  it('does not send a non-E.164 phone as text reminder', async () => {
    fetchMock.mockResolvedValueOnce(ok({ resource: { event: 'e/E1', uri: 'i' } }));
    await calendlyService.createBooking('t1', { ...input, phone: '555-1234' });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as any).body).text_reminder_number).toBeUndefined();
  });

  it('rejects when Calendly omits the event (never reports an unconfirmed booking)', async () => {
    fetchMock.mockResolvedValueOnce(ok({ resource: {} }));
    await expect(calendlyService.createBooking('t1', input)).rejects.toThrow(/did not confirm/);
  });

  it('flags 403 as access denied and 409/422 as slot unavailable', async () => {
    fetchMock.mockResolvedValueOnce(fail(403));
    await expect(calendlyService.createBooking('t1', input)).rejects.toMatchObject({ isAccessDenied: true });
    fetchMock.mockResolvedValueOnce(fail(409));
    await expect(calendlyService.createBooking('t1', input)).rejects.toMatchObject({ isSlotUnavailable: true });
    fetchMock.mockResolvedValueOnce(fail(422));
    const err = await calendlyService.createBooking('t1', input).catch((e) => e);
    expect(err).toBeInstanceOf(CalendlyApiError);
    expect(err.isSlotUnavailable).toBe(true);
  });
});

describe('cancelScheduledEvent', () => {
  it('POSTs the cancellation using the event uuid', async () => {
    fetchMock.mockResolvedValueOnce(ok({ resource: {} }));
    await calendlyService.cancelScheduledEvent('t1', 'https://api.calendly.com/scheduled_events/E1', 'changed mind');
    const [url, opts] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe('https://api.calendly.com/scheduled_events/E1/cancellation');
    expect(JSON.parse(opts.body)).toEqual({ reason: 'changed mind' });
  });

  it('treats already-cancelled as success', async () => {
    fetchMock.mockResolvedValueOnce(fail(400, 'Event is already canceled'));
    await expect(calendlyService.cancelScheduledEvent('t1', 'E1')).resolves.toBeUndefined();
  });

  it('propagates other failures', async () => {
    fetchMock.mockResolvedValueOnce(fail(500));
    await expect(calendlyService.cancelScheduledEvent('t1', 'E1')).rejects.toMatchObject({ status: 500 });
  });
});

describe('getEventInvitee', () => {
  it('returns the first active invitee', async () => {
    fetchMock.mockResolvedValueOnce(ok({ collection: [{ name: 'Jane', email: 'jane@x.com' }] }));
    expect(await calendlyService.getEventInvitee('t1', 'E1')).toEqual({ name: 'Jane', email: 'jane@x.com' });
  });
  it('throws when no invitee', async () => {
    fetchMock.mockResolvedValueOnce(ok({ collection: [] }));
    await expect(calendlyService.getEventInvitee('t1', 'E1')).rejects.toThrow();
  });
});

describe('token refresh', () => {
  it('refreshes an expiring token before use and persists it', async () => {
    process.env.CALENDLY_CLIENT_ID = 'cid';
    process.env.CALENDLY_CLIENT_SECRET = 'csecret';
    poolQuery.mockResolvedValueOnce(connectionRow({ expires_at: new Date(Date.now() - 1000) }));
    fetchMock.mockResolvedValueOnce(ok({ access_token: 'new', refresh_token: 'ref2', expires_in: 7200 }));
    const conn = await calendlyService.getConnection('t1');
    expect(conn?.accessToken).toBe('new');
    expect(String(fetchMock.mock.calls[0][0])).toContain('auth.calendly.com/oauth/token');
    expect(poolQuery.mock.calls[1][0]).toContain('UPDATE public.calendar_connections');
    delete process.env.CALENDLY_CLIENT_ID;
    delete process.env.CALENDLY_CLIENT_SECRET;
  });

  it('keeps the old token if refresh fails', async () => {
    process.env.CALENDLY_CLIENT_ID = 'cid';
    process.env.CALENDLY_CLIENT_SECRET = 'csecret';
    poolQuery.mockResolvedValueOnce(connectionRow({ expires_at: new Date(Date.now() - 1000) }));
    fetchMock.mockResolvedValueOnce(fail(400));
    const conn = await calendlyService.getConnection('t1');
    expect(conn?.accessToken).toBe('tok');
    delete process.env.CALENDLY_CLIENT_ID;
    delete process.env.CALENDLY_CLIENT_SECRET;
  });
});
