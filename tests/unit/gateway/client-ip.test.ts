/**
 * WebSocket upgrades have no Express request, so they worked out the caller's address themselves from the FIRST entry of
 * X-Forwarded-For, which a caller can write. That let a caller dodge the per-IP rate limit and pass an IP allowlist
 * (VOICE_WS_ALLOWED_IPS). One shared helper now follows the same rule as Express: trust N hops from the right, believe nothing further left.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { clientIpFromChain, getClientIp } from '../../../apps/gateway/src/server/client-ip.js';

const CHAIN = '203.0.113.9, 104.23.160.232'; // caller, Cloudflare's edge; the load balancer is the socket peer
const LB = '10.0.0.5';

describe('clientIpFromChain', () => {
  it('two trusted hops give the caller', () => {
    expect(clientIpFromChain(CHAIN, LB, 2)).toBe('203.0.113.9');
  });

  it('one trusted hop gives the edge, zero give the socket peer', () => {
    expect(clientIpFromChain(CHAIN, LB, 1)).toBe('104.23.160.232');
    expect(clientIpFromChain(CHAIN, LB, 0)).toBe(LB);
  });

  it('ignores addresses a caller adds on the left', () => {
    expect(clientIpFromChain(`6.6.6.6, ${CHAIN}`, LB, 2)).toBe('203.0.113.9');
    expect(clientIpFromChain(`6.6.6.6, 7.7.7.7, ${CHAIN}`, LB, 2)).toBe('203.0.113.9');
  });

  it('with no header, or a chain shorter than the trusted hops, falls back to the outermost address it has', () => {
    expect(clientIpFromChain(undefined, LB, 2)).toBe(LB);
    expect(clientIpFromChain('203.0.113.9', LB, 2)).toBe('203.0.113.9');
  });

  it('accepts a header that arrived as a list, and tolerates spaces and empties', () => {
    expect(clientIpFromChain(['203.0.113.9', '104.23.160.232'], LB, 2)).toBe('203.0.113.9');
    expect(clientIpFromChain(' 203.0.113.9 ,, 104.23.160.232 ', LB, 2)).toBe('203.0.113.9');
  });

  it('returns "unknown" when there is nothing at all', () => {
    expect(clientIpFromChain(undefined, undefined, 2)).toBe('unknown');
  });
});

describe('getClientIp', () => {
  it('reads the request the way the HTTP side does (default two hops)', () => {
    const req = { headers: { 'x-forwarded-for': `6.6.6.6, ${CHAIN}` }, socket: { remoteAddress: LB } } as any;
    expect(getClientIp(req)).toBe('203.0.113.9');
  });
});

describe('agrees with Express', () => {
  let server: http.Server | undefined;
  afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

  async function expressSees(hops: number, forwardedFor: string): Promise<string> {
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

  it.each([
    [0, CHAIN],
    [1, CHAIN],
    [2, CHAIN],
    [2, `6.6.6.6, ${CHAIN}`],
    [2, '203.0.113.9'],
    [3, CHAIN],
  ])('%s hops, "%s"', async (hops, xff) => {
    const fromExpress = await expressSees(hops, xff);
    // Express sees the test client as 127.0.0.1 (IPv4-mapped); use the same peer.
    expect(clientIpFromChain(xff, '127.0.0.1', hops).replace('::ffff:', '')).toBe(fromExpress.replace('::ffff:', ''));
  });
});
