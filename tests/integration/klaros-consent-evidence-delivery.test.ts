/**
 * lead.created / lead.updated with consent evidence, through the REAL consumer -> REAL webhook dispatch -> REAL HMAC signing ->
 * a REAL local HTTP receiver that verifies the signature over the exact bytes it received (the same algorithm Klaros uses;
 * see docs/HALLA_KLAROS_INTEGRATION_CONTRACT.md section 4).
 *
 * Substituted, as in klaros-webhook-delivery.test.ts: Postgres (`pool.query` is an in-memory fake), DNS, and the TLS transport
 * (forwarded to the local receiver). Not covered here: the Klaros Python receiver itself (not run in this task).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

const SECRET = 'c'.repeat(64);
const TENANT = '11111111-1111-4111-8111-111111111111';
const URL_OK = 'https://klaros.integration-test.example.com/api/v1/webhooks/halla/c14d42d1-4c63-46c1-bdc3-89d4dc2b7b7b';
const deliveries = new Map<string, boolean>();
let receiverPort = 0;

vi.mock('../../apps/gateway/src/services/db/pool.js', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: any[]) => {
      const t = sql.replace(/\s+/g, ' ').trim();
      if (t.startsWith('SELECT id, url, secret, events FROM public.custom_webhooks')) {
        return { rows: [{ id: 'wh-1', tenant_id: TENANT, url: URL_OK, secret: SECRET, active: true, events: ['lead.created', 'lead.updated'] }] };
      }
      if (t.startsWith('SELECT delivered FROM public.webhook_deliveries')) {
        const d = deliveries.get(`${params[0]}:${params[1]}`);
        return { rows: d === undefined ? [] : [{ delivered: d }] };
      }
      if (t.startsWith('INSERT INTO public.webhook_deliveries')) { deliveries.set(`${params[0]}:${params[3]}`, params[7]); return { rows: [] }; }
      if (t.startsWith('UPDATE public.custom_webhooks')) return { rows: [] };
      throw new Error(`Unexpected query in test fake: ${t}`);
    }),
  },
}));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }));
vi.mock('../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../apps/gateway/src/security/safe-http.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/gateway/src/security/safe-http.js')>()),
  safePostJson: vi.fn(async (url: URL, _addresses: string[], opts: { headers: Record<string, string>; body: string }) =>
    new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: receiverPort, path: url.pathname, method: 'POST', headers: opts.headers }, (res) => {
        let data = ''; res.on('data', (c) => (data += c)); res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      });
      req.on('error', reject); req.end(opts.body);
    })),
}));

import { handleKlarosWebhookEvent } from '../../apps/gateway/src/events/consumers/klaros-webhook.consumer.js';
import { createPlatformEvent } from '../../infrastructure/events/event-envelope.js';
import { PlatformEventTypes } from '../../infrastructure/events/event-types.js';
import { verifyWebhookSignature, signWebhookPayload } from '../../apps/gateway/src/security/webhook-signing.js';

const GOOD = { granted: true, scope: ['contact', 'store_personal_data'], method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: '2026-10-09T10:00:02.000Z' };

describe('consent evidence on lead events: delivered, signed, verified', () => {
  let server: http.Server;
  let received: Array<{ headers: http.IncomingHttpHeaders; body: string; url: string }>;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = ''; req.on('data', (c) => (body += c));
      req.on('end', () => { received.push({ headers: req.headers, body, url: req.url ?? '' }); res.statusCode = 200; res.end('{"ok":true}'); });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    receiverPort = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => { received = []; deliveries.clear(); });

  const send = async (type: 'LEAD_CREATED' | 'LEAD_UPDATED', payload: Record<string, unknown>) => {
    const event = createPlatformEvent(PlatformEventTypes[type] as never, payload, { tenantId: TENANT, callSid: 'CA1' });
    await handleKlarosWebhookEvent(event, { finalAttempt: false });
    return event;
  };
  const verify = (r: { headers: http.IncomingHttpHeaders; body: string }, secret = SECRET) =>
    verifyWebhookSignature({ secret, timestamp: String(r.headers['x-hallaai-timestamp']), rawBody: r.body, signatureHeader: String(r.headers['x-hallaai-signature']) });

  it.each([['LEAD_CREATED', 'lead.created'], ['LEAD_UPDATED', 'lead.updated']] as const)('%s: the consent object arrives exactly as recorded, inside a correctly signed body', async (type, name) => {
    const event = await send(type, { leadId: 'L1', phone: '+971500000001', name: 'Test Person', klarosLeadId: 'K1', consent: GOOD });
    expect(received).toHaveLength(1);
    expect(verify(received[0])).toEqual({ valid: true });
    const body = JSON.parse(received[0].body);
    expect(body).toMatchObject({ id: event.eventId, type: name, tenant_id: TENANT });
    expect(body.data.consent).toEqual(GOOD);
    expect(Object.keys(body.data).sort()).toEqual(['callId', 'consent', 'klarosLeadId', 'leadId', 'name', 'phone']);
    expect(received[0].url).toContain('/api/v1/webhooks/halla/c14d42d1-4c63-46c1-bdc3-89d4dc2b7b7b');
  });

  it('the signature covers the consent: changing granted:false -> true after signing, or the scope, fails verification', async () => {
    await send('LEAD_CREATED', { leadId: 'L1', phone: 'p', name: 'n', consent: { ...GOOD, granted: false, scope: ['store_personal_data'] } });
    const r = received[0];
    expect(verify(r).valid).toBe(true);
    const tampered = { ...r, body: r.body.replace('"granted":false', '"granted":true') };
    expect(verify(tampered)).toEqual({ valid: false, reason: 'signature_mismatch' });
    expect(verify(r, 'd'.repeat(64)).valid).toBe(false);
    // the same bytes re-signed by Halla's own signer reproduce the header (no second signature format exists)
    expect(`sha256=${signWebhookPayload(SECRET, String(r.headers['x-hallaai-timestamp']), r.body)}`).toBe(r.headers['x-hallaai-signature']);
  });

  it('no consent on the platform event => the key is absent from the delivered data (not null, not false)', async () => {
    await send('LEAD_CREATED', { leadId: 'L1', phone: 'p', name: 'n' });
    const body = JSON.parse(received[0].body);
    expect('consent' in body.data).toBe(false);
    expect(verify(received[0]).valid).toBe(true);
  });

  it.each([
    ['a bare boolean', true],
    ['a string', 'granted'],
    ['empty scope', { ...GOOD, scope: [] }],
    ['unknown scope', { ...GOOD, scope: ['everything'] }],
    ['no wording version', { ...GOOD, wording_version: '' }],
    ['no timestamp', { ...GOOD, recorded_at: undefined }],
    ['unknown method', { ...GOOD, method: 'phone_press_1' }],
  ])('invalid evidence (%s) is dropped, never delivered or repaired', async (_n, consent) => {
    await send('LEAD_CREATED', { leadId: 'L1', phone: 'p', name: 'n', consent });
    expect('consent' in JSON.parse(received[0].body).data).toBe(false);
  });

  it('extra fields smuggled into the consent object (wording text, transcript, medical content) never leave Halla', async () => {
    await send('LEAD_CREATED', { leadId: 'L1', phone: 'p', name: 'n', consent: { ...GOOD, wording_text: 'I agree to ...', transcript: 'I have diabetes', diagnosis: 'x' } });
    expect(received[0].body).not.toMatch(/wording_text|I agree|transcript|diabetes|diagnosis/);
    expect(JSON.parse(received[0].body).data.consent).toEqual(GOOD);
  });

  it('a replay of the same event id is delivered once (existing idempotency is unchanged)', async () => {
    const event = createPlatformEvent(PlatformEventTypes.LEAD_CREATED as never, { leadId: 'L1', phone: 'p', name: 'n', consent: GOOD }, { tenantId: TENANT, callSid: 'CA1' });
    await handleKlarosWebhookEvent(event, { finalAttempt: false });
    await handleKlarosWebhookEvent(event, { finalAttempt: false });
    expect(received).toHaveLength(1);
  });

  it('other lead events are untouched: lead.qualified / lead.escalated never carry a consent key even if one is smuggled in', async () => {
    for (const type of ['LEAD_QUALIFIED', 'LEAD_ESCALATED'] as const) {
      received = [];
      const event = createPlatformEvent(PlatformEventTypes[type] as never, { leadId: 'L1', status: 'qualified', target: 'human', reason: 'r', consent: GOOD }, { tenantId: TENANT, callSid: 'CA1' });
      await handleKlarosWebhookEvent(event, { finalAttempt: false });
      if (received.length) expect('consent' in JSON.parse(received[0].body).data).toBe(false);
    }
  });
});
