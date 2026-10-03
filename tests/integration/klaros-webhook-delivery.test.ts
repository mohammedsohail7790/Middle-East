/**
 * End-to-end test of Klaros webhook dispatch:
 *
 *   dispatchKlarosEvent() -> dispatch-time SSRF validation (HTTPS-only, DNS,
 *   every address checked) -> HMAC signing -> pinned HTTP POST -> a REAL local
 *   http.Server receiver -> REAL signature verification -> delivery records
 *   -> idempotent re-dispatch.
 *
 * Real: crypto signing/verification, the SSRF guard, the dispatch logic, and a
 * real HTTP receiver that sees the exact bytes and headers sent.
 *
 * Substituted (and why):
 *   - Postgres is UNAVAILABLE on this machine (no psql, Docker daemon down), so
 *     `pool.query` is an in-memory fake mirroring the SQL this service issues.
 *   - DNS is mocked so hostnames resolve to chosen public/private addresses.
 *   - The TLS transport (safe-http.ts) is replaced by a forwarder to the local
 *     receiver, because a local server cannot be a public HTTPS host. The
 *     transport's own behaviour (pinning, no redirects, TLS verification flags)
 *     is covered separately in tests/unit/gateway/safe-http.test.ts.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

interface FakeWebhook {
  id: string;
  tenant_id: string;
  url: string;
  secret: string;
  active: boolean;
  events: string[];
}

const webhooksTable = new Map<string, FakeWebhook>();
const deliveriesTable = new Map<string, { delivered: boolean; response_status: number | null }>();
const executedQueries: Array<{ sql: string; params: any[] }> = [];

vi.mock('../../apps/gateway/src/services/db/pool.js', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: any[]) => {
      const text = sql.replace(/\s+/g, ' ').trim();
      executedQueries.push({ sql: text, params });

      if (text.startsWith('SELECT id, url, secret, events FROM public.custom_webhooks')) {
        const [tenantId, types] = params as [string, string[]];
        return {
          rows: [...webhooksTable.values()].filter(
            (w) => w.tenant_id === tenantId && w.active && w.events.some((e) => types.includes(e))
          ),
        };
      }
      if (text.startsWith('SELECT delivered FROM public.webhook_deliveries')) {
        const row = deliveriesTable.get(`${params[0]}:${params[1]}`);
        return { rows: row ? [row] : [] };
      }
      if (text.startsWith('INSERT INTO public.webhook_deliveries')) {
        const [webhookId, , , eventId, , responseStatus, , delivered] = params;
        deliveriesTable.set(`${webhookId}:${eventId}`, { delivered, response_status: responseStatus });
        return { rows: [] };
      }
      if (text.startsWith('INSERT INTO public.custom_webhooks') || (text.startsWith('UPDATE public.custom_webhooks') && text.includes('RETURNING'))) {
        return {
          rows: [
            {
              id: 'wh-new',
              tenant_id: 'tenant-real-http-test',
              name: 'n',
              url: 'https://klaros.integration-test.example.com/hook',
              events: Array.isArray(params[3]) ? params[3] : [],
              secret: 's',
              headers: {},
              active: true,
              last_triggered_at: null,
              last_error: null,
              failure_count: 0,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }
      if (text.startsWith('SELECT id, tenant_id, name, url, events, secret')) {
        return {
          rows: [...webhooksTable.values()]
            .filter((w) => w.tenant_id === params[0])
            .map((w) => ({ ...w, name: 'n', headers: {}, last_triggered_at: null, last_error: null, failure_count: 0, created_at: new Date(), updated_at: new Date() })),
        };
      }
      if (text.startsWith('UPDATE public.custom_webhooks')) return { rows: [] };

      throw new Error(`Unexpected query in test fake: ${text}`);
    }),
  },
}));

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    if (host === 'klaros.integration-test.example.com') return [{ address: '93.184.216.34', family: 4 }];
    if (host === 'rebind.example.com') return [{ address: '10.0.0.7', family: 4 }];
    if (host === 'flaky-dns.example.com') throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    throw new Error(`unexpected DNS lookup for ${host}`);
  }),
}));

let receiverPort = 0;
const transportCalls: Array<{ url: string; addresses: string[] }> = [];
let transportOverride: ((...a: any[]) => Promise<{ status: number; body: string }>) | null = null;

vi.mock('../../apps/gateway/src/security/safe-http.js', () => ({
  safePostJson: vi.fn(async (url: URL, addresses: string[], opts: { headers: Record<string, string>; body: string }) => {
    transportCalls.push({ url: url.toString(), addresses });
    if (transportOverride) return transportOverride(url, addresses, opts);
    return new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: receiverPort, path: url.pathname, method: 'POST', headers: opts.headers },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
        }
      );
      req.on('error', reject);
      req.end(opts.body);
    });
  }),
}));

import { customWebhooksService } from '../../apps/gateway/src/services/webhooks/webhooks.service.js';
import { verifyWebhookSignature } from '../../apps/gateway/src/security/webhook-signing.js';

const SECRET = 'a'.repeat(64);
const TENANT = 'tenant-real-http-test';
const SAFE_URL = 'https://klaros.integration-test.example.com/webhooks/halla';

describe('Klaros webhook delivery (real HTTP receiver, real signing; Postgres/DNS/TLS-transport substituted)', () => {
  let server: http.Server;
  let received: Array<{ headers: http.IncomingHttpHeaders; body: string }>;

  const addWebhook = (id: string, url: string, events = ['call.completed']) =>
    webhooksTable.set(id, { id, tenant_id: TENANT, url, secret: SECRET, active: true, events });

  beforeAll(async () => {
    received = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"received":true}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    receiverPort = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    webhooksTable.clear();
    deliveriesTable.clear();
    executedQueries.length = 0;
    transportCalls.length = 0;
    transportOverride = null;
    received.length = 0;
    addWebhook('wh-safe', SAFE_URL);
  });

  describe('delivery', () => {
    it('delivers a signed envelope that an independent verifier accepts, over the validated address', async () => {
      const eventId = `evt-${Date.now()}`;
      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', eventId, {
        callId: 'CA123',
        qualificationStatus: 'qualified',
      });

      expect(received).toHaveLength(1);
      const { headers, body } = received[0];
      const envelope = JSON.parse(body);
      expect(Object.keys(envelope).sort()).toEqual(['data', 'id', 'tenant_id', 'timestamp', 'type']);
      expect(envelope).toMatchObject({
        id: eventId,
        type: 'call.completed',
        tenant_id: TENANT,
        data: { callId: 'CA123', qualificationStatus: 'qualified' },
      });
      expect(new Date(envelope.timestamp).toISOString()).toBe(envelope.timestamp);

      expect(headers['content-type']).toBe('application/json');
      const ts = headers['x-hallaai-timestamp'] as string;
      expect(ts).toMatch(/^\d{10}$/); // epoch seconds
      expect(headers['x-hallaai-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);

      expect(verifyWebhookSignature({ secret: SECRET, timestamp: ts, rawBody: body, signatureHeader: headers['x-hallaai-signature'] as string }).valid).toBe(true);

      // The connection was pinned to the DNS-validated address, not left to re-resolve.
      expect(transportCalls).toEqual([{ url: SAFE_URL, addresses: ['93.184.216.34'] }]);
      expect(deliveriesTable.get(`wh-safe:${eventId}`)).toEqual({ delivered: true, response_status: 200 });
    });

    it('rejects tampered bodies, a wrong secret and a replayed (stale) timestamp', async () => {
      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-verify', { callId: 'CA1' });
      const { headers, body } = received[0];
      const base = { timestamp: headers['x-hallaai-timestamp'] as string, signatureHeader: headers['x-hallaai-signature'] as string };

      expect(verifyWebhookSignature({ ...base, secret: SECRET, rawBody: body + ' ' }).valid).toBe(false);
      expect(verifyWebhookSignature({ ...base, secret: 'b'.repeat(64), rawBody: body }).valid).toBe(false);
      const tenMinutesLater = Math.floor(Date.now() / 1000) + 600;
      expect(verifyWebhookSignature({ ...base, secret: SECRET, rawBody: body, now: tenMinutesLater })).toEqual({
        valid: false,
        reason: 'stale_timestamp',
      });
    });

    it('does not re-deliver the same event id to the same webhook', async () => {
      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-dup', { callId: 'CA1' });
      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-dup', { callId: 'CA1' });
      expect(received).toHaveLength(1);
    });

    it('delivers distinct event ids as distinct deliveries', async () => {
      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-a', { callId: 'A' });
      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-b', { callId: 'B' });
      expect(received).toHaveLength(2);
    });

    it('a retry skips webhooks that already succeeded and only re-attempts the failed one', async () => {
      addWebhook('wh-second', SAFE_URL);
      let calls = 0;
      transportOverride = async () => {
        calls++;
        return calls === 2 ? { status: 503, body: 'down' } : { status: 200, body: 'ok' };
      };

      await expect(customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-partial', {})).rejects.toThrow(/503/);
      expect(deliveriesTable.get('wh-safe:evt-partial')?.delivered).toBe(true);
      expect(deliveriesTable.get('wh-second:evt-partial')?.delivered).toBe(false);

      transportOverride = async () => ({ status: 200, body: 'ok' });
      transportCalls.length = 0;
      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-partial', {});
      expect(transportCalls).toHaveLength(1); // only the previously failed webhook
      expect(deliveriesTable.get('wh-second:evt-partial')?.delivered).toBe(true);
    });
  });

  describe('SSRF: enforced on the real dispatch path, before any network access', () => {
    it.each([
      ['plain http', 'http://klaros.integration-test.example.com/hook'],
      ['localhost', 'https://localhost/hook'],
      ['localhost with trailing dot', 'https://localhost./hook'],
      ['a localhost subdomain', 'https://foo.localhost/hook'],
      ['127.0.0.1', 'https://127.0.0.1/hook'],
      ['127.0.0.2', 'https://127.0.0.2/hook'],
      ['a private address', 'https://10.0.0.5/hook'],
      ['link-local', 'https://169.254.169.253/hook'],
      ['CGNAT', 'https://100.64.0.1/hook'],
      ['the metadata endpoint', 'https://169.254.169.254/latest/meta-data'],
      ['metadata.google.internal.', 'https://metadata.google.internal./computeMetadata/v1'],
      ['a .internal host', 'https://db.internal/hook'],
      ['a .local host', 'https://printer.local/hook'],
      ['IPv6 loopback', 'https://[::1]/hook'],
      ['IPv6 unique-local', 'https://[fc00::1]/hook'],
      ['IPv4-mapped IPv6', 'https://[::ffff:127.0.0.1]/hook'],
      ['a public name that resolves to a private address (DNS rebinding)', 'https://rebind.example.com/hook'],
    ])('blocks %s', async (_label, url) => {
      webhooksTable.clear();
      addWebhook('wh-unsafe', url);

      await expect(customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-ssrf', {})).resolves.toBeUndefined();

      expect(transportCalls).toHaveLength(0);
      expect(received).toHaveLength(0);
      expect(deliveriesTable.get('wh-unsafe:evt-ssrf')?.delivered).toBe(false);
    });

    it('blocks the unsafe destination while still delivering to a safe one for the same event', async () => {
      addWebhook('wh-unsafe', 'https://127.0.0.1/hook');
      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-mixed', {});
      expect(received).toHaveLength(1);
      expect(deliveriesTable.get('wh-unsafe:evt-mixed')?.delivered).toBe(false);
      expect(deliveriesTable.get('wh-safe:evt-mixed')?.delivered).toBe(true);
    });

    it('re-validates at dispatch: a URL that was acceptable at registration but now resolves privately is blocked', async () => {
      addWebhook('wh-late-rebind', 'https://rebind.example.com/hook'); // "registered" earlier, DNS has since changed
      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-late', {});
      expect(transportCalls.every((c) => !c.url.includes('rebind.example.com'))).toBe(true);
    });

    it('a transient DNS failure is retryable (throws) and is not treated as a permanent block', async () => {
      webhooksTable.clear();
      addWebhook('wh-flaky', 'https://flaky-dns.example.com/hook');
      await expect(customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-dns', {})).rejects.toThrow(/could not be resolved/);
      expect(deliveriesTable.get('wh-flaky:evt-dns')?.delivered).toBe(false);
      expect(transportCalls).toHaveLength(0);
    });
  });

  describe('redirects', () => {
    it.each([
      ['a private address', 'https://10.0.0.1/admin'],
      ['localhost', 'https://localhost/admin'],
    ])('a 302 pointing at %s is not followed: one request, recorded as a failed delivery', async (_l, location) => {
      transportOverride = async () => ({ status: 302, body: `Found: ${location}` });

      await expect(customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-redirect', {})).rejects.toThrow(/302/);

      expect(transportCalls).toHaveLength(1);
      expect(transportCalls.some((c) => c.url.includes('10.0.0.1') || c.url.includes('localhost'))).toBe(false);
      expect(deliveriesTable.get('wh-safe:evt-redirect')).toEqual({ delivered: false, response_status: 302 });
    });
  });

  describe('failure handling', () => {
    it('a 500 from the receiver throws so the event bus retries, and is recorded', async () => {
      transportOverride = async () => ({ status: 500, body: 'boom' });
      await expect(customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-500', {})).rejects.toThrow(/500/);
      expect(deliveriesTable.get('wh-safe:evt-500')).toEqual({ delivered: false, response_status: 500 });
    });

    it('a network error throws and is recorded', async () => {
      transportOverride = async () => {
        throw new Error('ECONNRESET');
      };
      await expect(customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-net', {})).rejects.toThrow(/ECONNRESET/);
      expect(deliveriesTable.get('wh-safe:evt-net')?.delivered).toBe(false);
    });
  });

  describe('secret handling', () => {
    it('the signing secret never appears in the request body, headers, or any persisted/updated row', async () => {
      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-secret', { callId: 'CA1' });

      const { headers, body } = received[0];
      expect(body).not.toContain(SECRET);
      expect(JSON.stringify(headers)).not.toContain(SECRET);

      const writes = executedQueries.filter((q) => /^(INSERT|UPDATE)/.test(q.sql));
      expect(writes.length).toBeGreaterThan(0);
      for (const w of writes) expect(JSON.stringify(w.params)).not.toContain(SECRET);
    });

    it('never logs the signing secret, even when delivery fails', async () => {
      const { logger } = await import('../../apps/gateway/src/services/logger.js');
      const spies = (['error', 'warn', 'info', 'debug'] as const).map((level) => vi.spyOn(logger as any, level).mockImplementation(() => undefined as any));
      transportOverride = async () => ({ status: 500, body: 'boom' });
      addWebhook('wh-unsafe', 'https://127.0.0.1/hook');

      await customWebhooksService.dispatchKlarosEvent(TENANT, 'call.completed', 'evt-log', {}).catch(() => undefined);

      for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
      spies.forEach((s) => s.mockRestore());
    });
  });

  describe('signing-secret exposure', () => {
    it('create() returns the secret exactly once; update() and list() never return it', async () => {
      const created = await customWebhooksService.create(TENANT, { name: 'n', url: SAFE_URL, events: ['call.completed'] });
      expect(created.secret).toBe('s');

      const updated = await customWebhooksService.update(TENANT, 'wh-1', { events: ['lead.updated'] });
      expect(updated).not.toHaveProperty('secret');

      const listed = await customWebhooksService.list(TENANT); // the stored rows DO contain SECRET
      expect(listed.length).toBeGreaterThan(0);
      for (const w of listed) expect(w).not.toHaveProperty('secret');
      expect(JSON.stringify(listed)).not.toContain(SECRET);
    });
  });

  describe('registration-time validation', () => {
    const base = { name: 'klaros', events: ['call.completed'] };
    const inserts = () => executedQueries.filter((q) => q.sql.startsWith('INSERT INTO public.custom_webhooks'));

    it.each([
      ['http://klaros.integration-test.example.com/hook', /https/],
      ['https://localhost/hook', /not allowed/],
      ['https://127.0.0.2/hook', /not allowed/],
      ['https://[::1]/hook', /not allowed/],
      ['https://rebind.example.com/hook', /disallowed address/],
      ['https://user:pw@klaros.integration-test.example.com/hook', /credentials/],
    ])('create() rejects %s and writes nothing', async (url, pattern) => {
      await expect(customWebhooksService.create(TENANT, { ...base, url })).rejects.toThrow(pattern);
      expect(inserts()).toHaveLength(0);
    });

    it('create() accepts a safe public HTTPS destination and binds events as a real array (TEXT[] column)', async () => {
      await customWebhooksService.create(TENANT, { ...base, url: SAFE_URL, events: ['call.completed', 'lead.created'] });
      expect(inserts()).toHaveLength(1);
      const eventsParam = inserts()[0].params[3];
      expect(Array.isArray(eventsParam)).toBe(true);
      expect(eventsParam).toEqual(['call.completed', 'lead.created']);
    });

    it('update() re-validates a changed URL and binds events as a real array', async () => {
      await expect(customWebhooksService.update(TENANT, 'wh-1', { url: 'https://10.0.0.1/hook' })).rejects.toThrow();
      await customWebhooksService.update(TENANT, 'wh-1', { events: ['lead.updated'] });
      const upd = executedQueries.find((q) => q.sql.startsWith('UPDATE public.custom_webhooks') && q.sql.includes('RETURNING'));
      expect(upd).toBeTruthy();
      expect(upd!.params.some((p) => Array.isArray(p) && p[0] === 'lead.updated')).toBe(true);
    });

    it('rejects unknown event names with a 400-mapped ValidationError', async () => {
      const err = await customWebhooksService.create(TENANT, { ...base, url: SAFE_URL, events: ['not.real'] }).catch((e) => e);
      expect(err.name).toBe('ValidationError');
      expect(inserts()).toHaveLength(0);
    });
  });
});
