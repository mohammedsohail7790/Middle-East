import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';


vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({ voiceDb: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } }));
vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({ voiceRedis: { publish: vi.fn(async () => 1) } }));
vi.mock('../../../apps/gateway/src/services/appointments/tenant-timezone.js', () => ({ getTenantTimezone: vi.fn(async () => 'Asia/Dubai') }));
vi.mock('../../../apps/gateway/src/services/channels/channels.service.js', () => ({ channelsService: { getConnection: vi.fn(async () => null) } }));
vi.mock('../../../apps/gateway/src/services/whatsapp/whatsapp.store.js', () => ({
  whatsappStore: {
    getNumber: vi.fn(),
    getAccessToken: vi.fn(),
    findConversationByPhone: vi.fn(),
    upsertConversation: vi.fn(),
    insertOutbound: vi.fn(async () => {}),
    touchOutbound: vi.fn(async () => {}),
    recordNumberError: vi.fn(async () => {}),
  },
}));

import {
  verifySignature, parseWebhook, normalizePhone, optKeyword, toWaId,
} from '../../../apps/gateway/src/services/whatsapp/whatsapp.client.js';
import { parseLocalDateTime } from '../../../apps/gateway/src/services/whatsapp/whatsapp.time.js';
import { detectLanguage } from '../../../apps/gateway/src/services/whatsapp/whatsapp.agent.js';
import { isWindowOpen, languageCodeFor, notifyAppointmentConfirmed } from '../../../apps/gateway/src/services/whatsapp/whatsapp.outbound.js';
import { handleWhatsAppWebhook, verifyWhatsAppWebhook } from '../../../apps/gateway/src/services/whatsapp/whatsapp.controller.js';
import { whatsappStore } from '../../../apps/gateway/src/services/whatsapp/whatsapp.store.js';
import { channelsService } from '../../../apps/gateway/src/services/channels/channels.service.js';
import { voiceDb } from '../../../apps/gateway/src/services/voice/tenant-scope.js';

const SECRET = 'app-secret';
const sign = (body: string) => 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');

function fakeRes() {
  const res: any = { code: 0, body: undefined as unknown };
  res.sendStatus = (c: number) => { res.code = c; return res; };
  res.status = (c: number) => { res.code = c; return res; };
  res.type = () => res;
  res.send = (b: unknown) => { res.body = b; return res; };
  return res;
}

describe('phone + keyword helpers', () => {
  it('normalises WhatsApp ids and formatted numbers to E.164', () => {
    expect(normalizePhone('971501234567')).toBe('+971501234567');
    expect(normalizePhone('+971 50 123 4567')).toBe('+971501234567');
    expect(normalizePhone('12')).toBeNull();
    expect(toWaId('+971501234567')).toBe('971501234567');
  });
  it('recognises STOP/START in English and Arabic, only as the whole message', () => {
    expect(optKeyword(' STOP ')).toBe('out');
    expect(optKeyword('إيقاف')).toBe('out');
    expect(optKeyword('start')).toBe('in');
    expect(optKeyword('please stop calling me at 5')).toBeNull();
  });
  it('detects Arabic vs English', () => {
    expect(detectLanguage('مرحبا أريد حجز موعد')).toBe('ar');
    expect(detectLanguage('hello I need a booking')).toBe('en');
    expect(detectLanguage('123')).toBeUndefined();
    expect(languageCodeFor('ar-SA')).toBe('ar');
    expect(languageCodeFor(null)).toBe('en');
  });
});

describe('verifySignature', () => {
  const body = '{"object":"whatsapp_business_account"}';
  it('accepts a correct HMAC and rejects tampering', () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
    expect(verifySignature(body + ' ', sign(body), SECRET)).toBe(false);
    expect(verifySignature(body, 'sha256=' + 'a'.repeat(64), SECRET)).toBe(false);
  });
  it('fails closed without a secret or header', () => {
    expect(verifySignature(body, undefined, SECRET)).toBe(false);
    expect(verifySignature(body, sign(body), '')).toBe(false);
    expect(verifySignature(body, 'sha1=abc', SECRET)).toBe(false);
  });
});

describe('parseWebhook', () => {
  const payload = (value: any) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PN1' }, ...value } }] }] });

  it('extracts text, button taps, voice notes and statuses per receiving number', () => {
    const out = parseWebhook(payload({
      contacts: [{ wa_id: '971501234567', profile: { name: 'Sara' } }],
      messages: [
        { from: '971501234567', id: 'wamid.1', timestamp: '1760000000', type: 'text', text: { body: 'hi' } },
        { from: '971501234567', id: 'wamid.2', timestamp: '1760000001', type: 'interactive', interactive: { button_reply: { id: 'cancel:abc', title: 'Cancel' } } },
        { from: '971501234567', id: 'wamid.3', timestamp: '1760000002', type: 'audio', audio: { id: 'MEDIA1' } },
      ],
      statuses: [{ id: 'wamid.9', status: 'delivered' }, { id: 'wamid.8', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement' }] }, { id: 'x', status: 'weird' }],
    }));
    expect(out).toHaveLength(1);
    expect(out[0].phoneNumberId).toBe('PN1');
    const [text, button, audio] = out[0].messages;
    expect(text).toMatchObject({ from: '+971501234567', name: 'Sara', text: 'hi', type: 'text' });
    expect(button).toMatchObject({ buttonId: 'cancel:abc', text: 'Cancel' });
    expect(audio).toMatchObject({ type: 'audio', mediaId: 'MEDIA1' });
    expect(out[0].statuses).toEqual([
      { waMessageId: 'wamid.9', status: 'delivered', error: undefined },
      { waMessageId: 'wamid.8', status: 'failed', error: '131047 Re-engagement' },
    ]);
  });
  it('ignores foreign objects and entries without a phone_number_id', () => {
    expect(parseWebhook({ object: 'page', entry: [] })).toEqual([]);
    expect(parseWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ from: '1', id: 'a' }] } }] }] })).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
  });
});

describe('parseLocalDateTime', () => {
  it('turns business wall-clock time into the right instant (Dubai is UTC+4, no DST)', () => {
    expect(parseLocalDateTime('2026-10-24T14:00', 'Asia/Dubai')?.toISOString()).toBe('2026-10-24T10:00:00.000Z');
  });
  it('handles DST zones', () => {
    expect(parseLocalDateTime('2026-07-01T09:00', 'America/New_York')?.toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(parseLocalDateTime('2026-12-01T09:00', 'America/New_York')?.toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });
  it('keeps explicit offsets and rejects garbage', () => {
    expect(parseLocalDateTime('2026-10-24T10:00:00Z', 'Asia/Dubai')?.toISOString()).toBe('2026-10-24T10:00:00.000Z');
    expect(parseLocalDateTime('tomorrow at 3', 'Asia/Dubai')).toBeNull();
    expect(parseLocalDateTime('', 'Asia/Dubai')).toBeNull();
  });
});

describe('24h service window', () => {
  it('is open only within 24 hours of the last inbound message', () => {
    const now = Date.now();
    expect(isWindowOpen({ lastInboundAt: new Date(now - 23 * 3600e3) }, now)).toBe(true);
    expect(isWindowOpen({ lastInboundAt: new Date(now - 25 * 3600e3) }, now)).toBe(false);
    expect(isWindowOpen({ lastInboundAt: null }, now)).toBe(false);
  });
});

describe('webhook handlers', () => {
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify-me';
  });
  it('GET handshake echoes the challenge only for the right token', () => {
    const ok = fakeRes();
    verifyWhatsAppWebhook({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '1234' } } as any, ok);
    expect(ok.code).toBe(200);
    expect(ok.body).toBe('1234');
    const bad = fakeRes();
    verifyWhatsAppWebhook({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope!!!!!!', 'hub.challenge': '1' } } as any, bad);
    expect(bad.code).toBe(403);
  });
  it('POST rejects a bad signature with 401 and accepts a good one with 200', () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const header = (v?: string) => (name: string) => (name === 'x-hub-signature-256' ? v : undefined);
    const bad = fakeRes();
    handleWhatsAppWebhook({ body: Buffer.from(body), header: header('sha256=' + '0'.repeat(64)) } as any, bad);
    expect(bad.code).toBe(401);
    const good = fakeRes();
    handleWhatsAppWebhook({ body: Buffer.from(body), header: header(sign(body)) } as any, good);
    expect(good.code).toBe(200);
  });
  it('POST fails closed (503) when the app secret is not configured', () => {
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.META_APP_SECRET;
    const res = fakeRes();
    handleWhatsAppWebhook({ body: Buffer.from('{}'), header: () => undefined } as any, res);
    expect(res.code).toBe(503);
  });
});

describe('notifyAppointmentConfirmed gating', () => {
  const appt = { id: 'a1', name: 'Sara', phone: '+971501234567', service: 'Cut', scheduled_time: new Date(Date.now() + 86400e3), status: 'booked', company_name: 'Glow Salon' };
  const q = voiceDb.query as any;

  beforeEach(() => {
    vi.clearAllMocks();
    (whatsappStore.getNumber as any).mockResolvedValue({ phoneNumberId: 'PN1', status: 'connected' });
    (whatsappStore.getAccessToken as any).mockResolvedValue('tok');
    q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM public.appointments a')) return { rows: [appt], rowCount: 1 };
      if (sql.includes("metadata->'consent_capture'")) return { rows: [{ cc: null }], rowCount: 1 };
      if (sql.includes('wa_confirmation_sent = TRUE')) return { rows: [{ id: 'a1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
  });

  it('does not message a number that never wrote to us unless the tenant attested opt-in', async () => {
    (whatsappStore.findConversationByPhone as any).mockResolvedValue(null);
    (channelsService.getConnection as any).mockResolvedValue({ config: {} });
    const r = await notifyAppointmentConfirmed('t1', 'a1');
    expect(r).toMatchObject({ ok: false, reason: 'no_opt_in' });
    expect(whatsappStore.insertOutbound).not.toHaveBeenCalled();
  });

  it('never messages someone who opted out', async () => {
    (whatsappStore.findConversationByPhone as any).mockResolvedValue({ id: 'c1', optedOut: true });
    const r = await notifyAppointmentConfirmed('t1', 'a1');
    expect(r).toMatchObject({ ok: false, reason: 'opted_out' });
  });

  it('stays out of consent-capture (Medical Tourism) tenants entirely', async () => {
    q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM public.appointments a')) return { rows: [appt], rowCount: 1 };
      if (sql.includes("metadata->'consent_capture'")) return { rows: [{ cc: { wordingVersion: 'v1' } }], rowCount: 1 };
      if (sql.includes('wa_confirmation_sent = TRUE')) return { rows: [{ id: 'a1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const r = await notifyAppointmentConfirmed('t1', 'a1');
    expect(r).toMatchObject({ ok: false, reason: 'restricted_tenant' });
  });

  it('uses the approved template when the 24h window is closed, plain text when it is open', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ messages: [{ id: 'wamid.OUT' }] }) }));
    vi.stubGlobal('fetch', fetchMock);
    (channelsService.getConnection as any).mockResolvedValue({ config: { notifyCallers: true } });

    (whatsappStore.findConversationByPhone as any).mockResolvedValue(null);
    (whatsappStore.upsertConversation as any).mockResolvedValue({ id: 'c1', customerPhone: '+971501234567', lastInboundAt: null, language: null, optedOut: false });
    await notifyAppointmentConfirmed('t1', 'a1');
    const closedCall = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(closedCall.type).toBe('template');
    expect(closedCall.template.name).toBe('appointment_confirmation');
    expect(closedCall.to).toBe('971501234567');

    fetchMock.mockClear();
    const open = { id: 'c1', customerPhone: '+971501234567', lastInboundAt: new Date(), language: 'ar', optedOut: false };
    (whatsappStore.findConversationByPhone as any).mockResolvedValue(open);
    await notifyAppointmentConfirmed('t1', 'a1');
    const openCall = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(openCall.type).toBe('text');
    expect(openCall.text.body).toContain('Glow Salon');
    vi.unstubAllGlobals();
  });
});
