import https from 'node:https';
import { isIP } from 'node:net';
import { normalizeHostname } from './ssrf-guard.js';

export interface SafePostResult {
  status: number;
  body: string;
}

export interface SafePostOptions {
  headers: Record<string, string>;
  body: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

type LookupCallback = (err: Error | null, address: any, family?: number) => void;

/**
 * A `lookup` that ignores DNS and answers with the addresses that were already
 * validated. Because the socket can only ever connect to those, a hostname
 * that re-resolves to an internal address after validation (DNS rebinding)
 * has no effect.
 */
export function createPinnedLookup(addresses: string[]) {
  return (_hostname: string, options: { all?: boolean } | undefined, callback: LookupCallback): void => {
    const entries = addresses.map((address) => ({ address, family: isIP(address) }));
    if (options && options.all) {
      callback(null, entries);
      return;
    }
    callback(null, entries[0].address, entries[0].family);
  };
}

/**
 * HTTPS POST to a pre-validated target. Redirects are never followed (a 3xx is
 * simply returned to the caller as a non-success status), TLS certificate
 * validation stays on, and the connection is pinned to `addresses`.
 */
export function safePostJson(
  url: URL,
  addresses: string[],
  { headers, body, timeoutMs = 10_000, maxResponseBytes = 65_536 }: SafePostOptions
): Promise<SafePostResult> {
  const host = normalizeHostname(url.hostname);
  const literalIp = isIP(host) !== 0;

  return new Promise<SafePostResult>((resolve, reject) => {
    const req = https.request(
      {
        protocol: 'https:',
        hostname: host,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
        lookup: createPinnedLookup(addresses) as any,
        servername: literalIp ? undefined : host,
        agent: false,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          if (received >= maxResponseBytes) return;
          const slice = chunk.subarray(0, maxResponseBytes - received);
          received += slice.length;
          chunks.push(slice);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('Webhook request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}
