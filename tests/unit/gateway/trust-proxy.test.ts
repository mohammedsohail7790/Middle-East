/**
 * The gateway sits behind two hops (Render's edge, which is Cloudflare, then Render's load balancer).
 * With one trusted hop the app saw Cloudflare's address instead of the caller's, so audit events carried a Cloudflare IP that
 * also changed from request to request. Two trusted hops give the caller's address. Entries a caller adds to X-Forwarded-For
 * sit further left and must never be believed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveTrustProxyHops } from '../../../apps/gateway/src/server/trust-proxy.js';

describe('resolveTrustProxyHops', () => {
  it('defaults to 2 hops', () => {
    expect(resolveTrustProxyHops(undefined)).toBe(2);
    expect(resolveTrustProxyHops('')).toBe(2);
  });

  it('accepts a whole number from 0 to 5', () => {
    expect(resolveTrustProxyHops('1')).toBe(1);
    expect(resolveTrustProxyHops('0')).toBe(0);
    expect(resolveTrustProxyHops('5')).toBe(5);
  });

  it('falls back to the default for anything else, so a typo never opens the door', () => {
    expect(resolveTrustProxyHops('abc')).toBe(2);
    expect(resolveTrustProxyHops('-1')).toBe(2);
    expect(resolveTrustProxyHops('99')).toBe(2);
    expect(resolveTrustProxyHops('1.5')).toBe(2);
  });
});

describe('client address behind the proxy chain', () => {
  let server: http.Server | undefined;
  afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

  async function seenAs(hops: number, forwardedFor: string): Promise<string> {
    const app = express();
    app.set('trust proxy', hops);
    app.get('/ip', (req, res) => res.send(req.ip));
    server = http.createServer(app);
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    return new Promise((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: '/ip', headers: { 'X-Forwarded-For': forwardedFor } }, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve(body));
        })
        .on('error', reject);
    });
  }

  // What the app receives from Render: the caller, then Cloudflare's edge; the load balancer is the socket peer.
  const CHAIN = '203.0.113.9, 104.23.160.232';

  it('one trusted hop sees Cloudflare, the problem this fixes', async () => {
    expect(await seenAs(1, CHAIN)).toBe('104.23.160.232');
  });

  it('two trusted hops see the caller', async () => {
    expect(await seenAs(2, CHAIN)).toBe('203.0.113.9');
  });

  it('an address the caller adds to X-Forwarded-For is ignored', async () => {
    expect(await seenAs(2, `6.6.6.6, ${CHAIN}`)).toBe('203.0.113.9');
    expect(await seenAs(2, `6.6.6.6, 7.7.7.7, ${CHAIN}`)).toBe('203.0.113.9');
  });
});
