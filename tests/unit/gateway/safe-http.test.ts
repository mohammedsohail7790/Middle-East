import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('node:https', () => {
  const request = vi.fn();
  return { default: { request }, request };
});

import https from 'node:https';
import { createPinnedLookup, safePostJson } from '../../../apps/gateway/src/security/safe-http.js';

const request = https.request as unknown as ReturnType<typeof vi.fn>;

interface Captured {
  options: any;
  payload?: string;
}

function stubServer(status: number, body: string, headers: Record<string, string> = {}): Captured {
  const captured: Captured = { options: undefined };
  request.mockImplementation((options: any, callback: (res: any) => void) => {
    captured.options = options;
    const req: any = new EventEmitter();
    req.destroy = (err?: Error) => req.emit('error', err);
    req.end = (payload: string) => {
      captured.payload = payload;
      const res: any = new EventEmitter();
      res.statusCode = status;
      res.headers = headers;
      callback(res);
      setImmediate(() => {
        res.emit('data', Buffer.from(body));
        res.emit('end');
      });
    };
    return req;
  });
  return captured;
}

const url = new URL('https://klaros.example.com/webhooks/halla?x=1');

describe('safe-http', () => {
  beforeEach(() => request.mockReset());

  it('pins the socket to the validated addresses instead of re-resolving DNS', async () => {
    const captured = stubServer(200, '{"ok":true}');
    await safePostJson(url, ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'], { headers: {}, body: '{}' });

    const lookupFn = captured.options.lookup;
    const single = await new Promise<any[]>((resolve) => lookupFn('klaros.example.com', {}, (...a: any[]) => resolve(a)));
    expect(single).toEqual([null, '93.184.216.34', 4]);

    const all = await new Promise<any[]>((resolve) => lookupFn('klaros.example.com', { all: true }, (...a: any[]) => resolve(a)));
    expect(all[1]).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
  });

  it('keeps TLS verification on and SNI on the real hostname', async () => {
    const captured = stubServer(200, 'ok');
    await safePostJson(url, ['93.184.216.34'], { headers: { 'X-Test': '1' }, body: '{"a":1}' });

    expect(captured.options).toMatchObject({
      protocol: 'https:',
      hostname: 'klaros.example.com',
      path: '/webhooks/halla?x=1',
      method: 'POST',
      servername: 'klaros.example.com',
      agent: false,
    });
    expect(captured.options).not.toHaveProperty('rejectUnauthorized');
    expect(captured.options.headers['Content-Length']).toBe('7');
    expect(captured.payload).toBe('{"a":1}');
  });

  it('does not set SNI for an IP-literal destination', async () => {
    const captured = stubServer(200, 'ok');
    await safePostJson(new URL('https://8.8.8.8/hook'), ['8.8.8.8'], { headers: {}, body: '{}' });
    expect(captured.options.servername).toBeUndefined();
  });

  it('never follows a redirect: a 302 to a private URL is returned as-is after exactly one request', async () => {
    stubServer(302, '', { location: 'https://127.0.0.1/admin' });
    const result = await safePostJson(url, ['93.184.216.34'], { headers: {}, body: '{}' });

    expect(result.status).toBe(302);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('never follows a redirect to localhost either', async () => {
    stubServer(307, '', { location: 'https://localhost/' });
    const result = await safePostJson(url, ['93.184.216.34'], { headers: {}, body: '{}' });
    expect(result.status).toBe(307);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('caps the stored response body', async () => {
    stubServer(500, 'x'.repeat(10_000));
    const result = await safePostJson(url, ['93.184.216.34'], { headers: {}, body: '{}', maxResponseBytes: 100 });
    expect(result.body).toHaveLength(100);
  });

  it('rejects on timeout and on socket errors', async () => {
    request.mockImplementation((_o: any, _cb: any) => {
      const req: any = new EventEmitter();
      req.destroy = (err?: Error) => req.emit('error', err);
      req.end = () => setImmediate(() => req.emit('timeout'));
      return req;
    });
    await expect(safePostJson(url, ['93.184.216.34'], { headers: {}, body: '{}' })).rejects.toThrow(/timed out/);

    request.mockImplementation(() => {
      const req: any = new EventEmitter();
      req.end = () => setImmediate(() => req.emit('error', new Error('ECONNRESET')));
      return req;
    });
    await expect(safePostJson(url, ['93.184.216.34'], { headers: {}, body: '{}' })).rejects.toThrow(/ECONNRESET/);
  });

  it('createPinnedLookup answers from the supplied list only', () => {
    const lookupFn = createPinnedLookup(['1.2.3.4']);
    let got: any[] = [];
    lookupFn('anything.example.com', undefined, (...a: any[]) => (got = a));
    expect(got).toEqual([null, '1.2.3.4', 4]);
  });
});
