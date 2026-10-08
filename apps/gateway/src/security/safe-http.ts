import https from 'node:https';
import { isIP } from 'node:net';
import { normalizeHostname } from './ssrf-guard.js';

export interface SafePostResult {
  status: number;
  body: string;
  /** Allow-listed, non-sensitive response headers (see DIAGNOSTIC_RESPONSE_HEADERS). Empty if none were present. */
  headers?: Record<string, string>;
}

/**
 * The only response headers that are kept. They identify WHICH layer answered (a CDN/edge, a platform router or the
 * application) and any rate-limit hint, which is what is needed to diagnose a 429 or a 5xx; none can carry caller or
 * customer data. Everything else is dropped, and every value is length-capped.
 */
export const DIAGNOSTIC_RESPONSE_HEADERS = [
  'retry-after', 'server', 'via', 'content-type', 'cf-ray', 'cf-cache-status', 'rndr-id', 'x-render-origin-server',
  'x-request-id', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'ratelimit-limit',
  'ratelimit-remaining', 'ratelimit-reset', 'x-envoy-upstream-service-time',
] as const;

export function pickDiagnosticHeaders(raw: Record<string, string | string[] | undefined> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const name of DIAGNOSTIC_RESPONSE_HEADERS) {
    const v = raw[name];
    const value = Array.isArray(v) ? v.join(', ') : v;
    if (typeof value === 'string' && value !== '') out[name] = value.slice(0, 120);
  }
  return out;
}

/** Identifies Halla to the receiver and to any CDN/WAF in front of it (a request with no User-Agent is a common trigger for edge blocking and rate limiting). */
export const WEBHOOK_USER_AGENT = 'HallaAI-Webhooks/1.0';

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
        headers: { 'User-Agent': WEBHOOK_USER_AGENT, ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
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
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: pickDiagnosticHeaders(res.headers) })
        );
        res.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('Webhook request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

export type RejectionLayerHint = 'application' | 'edge_or_proxy' | 'indeterminate';

/**
 * A HINT, not a verdict, about which layer produced a non-2xx answer, from the allow-listed headers only.
 *
 *  - application:   the platform router passed it to the app (`x-render-origin-server` present), the app stamped a request id
 *                   (`x-request-id`), and the body type is JSON — what an application-level error handler produces.
 *  - edge_or_proxy: no origin-server header and no application request id, from a CDN/proxy (`server: cloudflare`, `cf-ray`,
 *                   `via`), with a plain-text or HTML (non-JSON) body.
 *  - indeterminate: anything else (for example a missing header set, or only some of the application markers).
 *
 * It cannot PROVE a root cause: an application can omit a request id on an early rejection, and a proxy can forward an
 * application's headers. It tells an operator where to look first.
 */
export function diagnoseRejectionLayer(status: number, headers: Record<string, string> | undefined): RejectionLayerHint {
  if (status < 400 || !headers) return 'indeterminate';
  const has = (h: string) => typeof headers[h] === 'string' && headers[h] !== '';
  const json = /json/i.test(headers['content-type'] ?? '');
  if (has('x-render-origin-server') && has('x-request-id') && json) return 'application';
  if (!json && !has('x-render-origin-server') && !has('x-request-id') && (has('cf-ray') || /cloudflare/i.test(headers.server ?? '') || has('via'))) return 'edge_or_proxy';
  return 'indeterminate';
}
