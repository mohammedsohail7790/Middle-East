/**
 * Phase 7 (Klaros webhook 429): what Halla's outbound webhook client sends, and what it now KEEPS from a rejection so
 * the next 429 can be attributed to a layer (CDN/edge, platform router or application). This is Halla-side observability;
 * it does not resolve the original 429 (see the readiness report: KLAROS_WEBHOOK_DELIVERY = BLOCKED).
 *
 * Substituted: node:https (no network); a fake request/response pair is driven by hand.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const requests: Array<{ options: Record<string, any>; body: string }> = [];
let nextResponse: { statusCode: number; headers: Record<string, string | string[]>; body: string } = { statusCode: 200, headers: {}, body: 'ok' };

vi.mock('node:https', () => ({
  default: {
    request: (options: Record<string, any>, onResponse: (res: EventEmitter & { statusCode?: number; headers?: unknown }) => void) => {
      const req = new EventEmitter() as EventEmitter & { end: (b: string) => void; destroy: (e?: Error) => void };
      req.end = (body: string) => {
        requests.push({ options, body });
        const res = new EventEmitter() as EventEmitter & { statusCode?: number; headers?: unknown };
        res.statusCode = nextResponse.statusCode;
        res.headers = nextResponse.headers;
        onResponse(res);
        res.emit('data', Buffer.from(nextResponse.body));
        res.emit('end');
      };
      req.destroy = () => {};
      return req;
    },
  },
}));

import { safePostJson, pickDiagnosticHeaders, diagnoseRejectionLayer, DIAGNOSTIC_RESPONSE_HEADERS, WEBHOOK_USER_AGENT } from '../../../apps/gateway/src/security/safe-http.js';

const URL_ = new URL('https://klaros.example.test/api/v1/webhooks/halla/4f5f6d5f-0ab0-4fbb-b8d7-2595277d0351');

describe('the outbound webhook request', () => {
  it('addresses the receiver by hostname (Host + SNI), pinned to the validated IP, with a User-Agent and the signature headers', async () => {
    requests.length = 0;
    nextResponse = { statusCode: 200, headers: {}, body: 'ok' };
    await safePostJson(URL_, ['93.184.216.34'], { headers: { 'Content-Type': 'application/json', 'X-HallaAI-Timestamp': '1', 'X-HallaAI-Signature': 'sha256=abc' }, body: '{"id":"e"}' });
    const o = requests[0].options;
    expect(o.hostname).toBe('klaros.example.test');
    expect(o.servername).toBe('klaros.example.test');
    expect(o.path).toBe('/api/v1/webhooks/halla/4f5f6d5f-0ab0-4fbb-b8d7-2595277d0351');
    expect(o.method).toBe('POST');
    expect(o.headers['User-Agent']).toBe(WEBHOOK_USER_AGENT);
    expect(o.headers['X-HallaAI-Signature']).toBe('sha256=abc');
    expect(o.headers['Content-Length']).toBe(String(Buffer.byteLength('{"id":"e"}')));
    expect(typeof o.lookup).toBe('function');
    expect(o.agent).toBe(false);
  });

  it('lets a caller override the User-Agent', async () => {
    requests.length = 0;
    await safePostJson(URL_, ['93.184.216.34'], { headers: { 'User-Agent': 'custom/1' }, body: '{}' });
    expect(requests[0].options.headers['User-Agent']).toBe('custom/1');
  });
});

describe('what is kept from a rejection', () => {
  it('a 429 keeps the allow-listed layer-identifying and rate-limit headers, and drops everything else', async () => {
    nextResponse = {
      statusCode: 429, body: 'Too Many Requests',
      headers: {
        'retry-after': '30', server: 'cloudflare', 'cf-ray': 'abc123-DXB', 'x-render-origin-server': 'uvicorn', 'x-request-id': 'req-1',
        'x-ratelimit-remaining': '0', 'content-type': 'text/plain', 'set-cookie': ['session=SECRET'], authorization: 'Bearer SECRET',
        'x-api-key': 'SECRET', 'x-customer-email': 'someone@example.com',
      },
    };
    const r = await safePostJson(URL_, ['93.184.216.34'], { headers: {}, body: '{}' });
    expect(r.status).toBe(429);
    expect(r.body).toBe('Too Many Requests');
    expect(r.headers).toEqual({
      'retry-after': '30', server: 'cloudflare', 'cf-ray': 'abc123-DXB', 'x-render-origin-server': 'uvicorn', 'x-request-id': 'req-1',
      'x-ratelimit-remaining': '0', 'content-type': 'text/plain',
    });
    expect(JSON.stringify(r.headers)).not.toMatch(/SECRET|someone@example|cookie|authorization/i);
  });

  it('an edge-generated 429 is distinguishable from an application one: no x-render-origin-server, no x-request-id', async () => {
    nextResponse = { statusCode: 429, body: 'Too Many Requests', headers: { server: 'cloudflare', 'cf-ray': 'r1', 'content-type': 'text/plain' } };
    const edge = (await safePostJson(URL_, ['93.184.216.34'], { headers: {}, body: '{}' })).headers!;
    nextResponse = { statusCode: 429, body: '{"detail":"rate limit exceeded"}', headers: { server: 'cloudflare', 'x-render-origin-server': 'uvicorn', 'x-request-id': 'r2', 'retry-after': '12', 'content-type': 'application/json' } };
    const app = (await safePostJson(URL_, ['93.184.216.34'], { headers: {}, body: '{}' })).headers!;
    expect('x-render-origin-server' in edge).toBe(false);
    expect('x-render-origin-server' in app).toBe(true);
    expect(app['retry-after']).toBe('12');
  });

  it('pickDiagnosticHeaders caps each value, joins arrays, and tolerates missing input', () => {
    expect(pickDiagnosticHeaders(undefined)).toEqual({});
    expect(pickDiagnosticHeaders({})).toEqual({});
    expect(pickDiagnosticHeaders({ server: 'x'.repeat(500) }).server).toHaveLength(120);
    expect(pickDiagnosticHeaders({ via: ['a', 'b'] }).via).toBe('a, b');
    expect(pickDiagnosticHeaders({ server: '' })).toEqual({});
  });

  it('the allow-list contains no header that can carry credentials, cookies or customer data', () => {
    for (const h of DIAGNOSTIC_RESPONSE_HEADERS) expect(h).not.toMatch(/cookie|auth|token|key|secret|email|user|customer/);
  });
});

// What the NEXT 429 would indicate. It is a hint from allow-listed headers only; it can never prove a root cause.
describe('diagnoseRejectionLayer (a hint, never a proof)', () => {
  it('application: JSON body + application request id + platform origin-server header', () => {
    expect(diagnoseRejectionLayer(429, { 'content-type': 'application/json', 'x-request-id': 'abc', 'x-render-origin-server': 'uvicorn', 'retry-after': '12', server: 'cloudflare' })).toBe('application');
  });

  it('edge/proxy: non-JSON body, no origin-server header, no application request id, CDN/proxy markers', () => {
    expect(diagnoseRejectionLayer(429, { 'content-type': 'text/plain', server: 'cloudflare', 'cf-ray': 'x' })).toBe('edge_or_proxy');
    expect(diagnoseRejectionLayer(429, { 'content-type': 'text/html', via: '1.1 vegur' })).toBe('edge_or_proxy');
  });

  it('indeterminate: a JSON edge answer, partial markers, no headers, an empty set, or a non-error status', () => {
    expect(diagnoseRejectionLayer(429, { 'content-type': 'application/json', server: 'cloudflare' })).toBe('indeterminate');
    expect(diagnoseRejectionLayer(429, { 'x-request-id': 'abc', 'cf-ray': 'x' })).toBe('indeterminate');
    expect(diagnoseRejectionLayer(429, undefined)).toBe('indeterminate');
    expect(diagnoseRejectionLayer(429, {})).toBe('indeterminate');
    expect(diagnoseRejectionLayer(200, { server: 'cloudflare', 'cf-ray': 'x', 'content-type': 'text/plain' })).toBe('indeterminate');
  });
});
