import type { IncomingMessage } from 'http';
import { resolveTrustProxyHops } from './trust-proxy.js';

/**
 * The caller's address for requests that do not go through Express (WebSocket upgrades), using the same rule as
 * Express's `trust proxy`: believe the socket peer and the nearest `hops - 1` entries of X-Forwarded-For counted from the
 * right, and nothing further left, because that is where a caller's own made-up entries sit.
 *
 * With two hops on Render the chain is caller, Cloudflare's edge, then the load balancer as the socket peer, so the answer
 * is the caller. A header or chain shorter than the trusted hops gives the outermost address there is.
 */
export function clientIpFromChain(
  forwardedFor: string | string[] | undefined,
  socketAddress: string | undefined,
  hops: number
): string {
  const entries = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Nearest first: the socket peer, then the header entries from the right.
  const nearestFirst = [...(socketAddress ? [socketAddress] : []), ...entries.reverse()];
  if (nearestFirst.length === 0) return 'unknown';
  return nearestFirst[Math.min(hops, nearestFirst.length - 1)];
}

export function getClientIp(request: Pick<IncomingMessage, 'headers' | 'socket'>): string {
  return clientIpFromChain(
    request.headers['x-forwarded-for'],
    request.socket?.remoteAddress,
    resolveTrustProxyHops(process.env.TRUST_PROXY_HOPS)
  );
}
