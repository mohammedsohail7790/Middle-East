import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { URL } from 'node:url';
import { InputValidationError } from './input-validation-error.js';

/** DNS could not resolve the host. Retryable at dispatch time, unlike an unsafe destination. */
export class HostResolutionError extends InputValidationError {}

const UNSAFE_RANGES = new BlockList();
const v4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // RFC6598 CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. cloud metadata 169.254.169.254)
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];
for (const [net, prefix] of v4) UNSAFE_RANGES.addSubnet(net, prefix, 'ipv4');

const v6: Array<[string, number]> = [
  ['::', 96], // unspecified, loopback and deprecated IPv4-compatible
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard-only
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds an IPv4 address)
  ['fc00::', 7], // unique-local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
];
for (const [net, prefix] of v6) UNSAFE_RANGES.addSubnet(net, prefix, 'ipv6');

const INTERNAL_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.intranet',
  '.corp',
  '.lan',
  '.home.arpa',
];

/** Webhooks may only target the default TLS port or 8443 — not arbitrary internal-style service ports. */
const ALLOWED_PORTS = new Set(['', '443', '8443']);

/** Lowercase, strip IPv6 brackets and any trailing DNS root dots (`localhost.` -> `localhost`). */
export function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
}

/**
 * IPv4-mapped IPv6 (::ffff:a.b.c.d in any spelling) is never a legitimate public
 * webhook host. Detected explicitly because Node's BlockList evaluates plain
 * IPv4 addresses against IPv6 rules via their mapped form, so a ::ffff:0:0/96
 * range rule would wrongly block every IPv4 address.
 */
function isIpv4MappedIpv6(address: string): boolean {
  try {
    const canonical = new URL(`http://[${address}]/`).hostname.replace(/^\[|\]$/g, '');
    return canonical.startsWith('::ffff:');
  } catch {
    return true;
  }
}

/** True when the address is loopback/private/link-local/CGNAT/ULA/mapped/reserved — or not an IP at all. */
export function isUnsafeIp(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '').split('%')[0];
  const family = isIP(bare);
  if (family === 0) return true;
  if (family === 6 && isIpv4MappedIpv6(bare)) return true;
  return UNSAFE_RANGES.check(bare, family === 6 ? 'ipv6' : 'ipv4');
}

function isUnsafeHostnameLiteral(host: string): boolean {
  if (!host) return true;
  if (isIP(host)) return isUnsafeIp(host);
  if (host === 'localhost' || host === 'metadata') return true;
  if (INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  // A single-label name ("intranet", "db") can only resolve inside a private network.
  if (!host.includes('.')) return true;
  return false;
}

export interface SafeUrlOptions {
  /** Webhook destinations must be HTTPS; other callers (knowledge import) may still allow plain HTTP. */
  requireHttps?: boolean;
}

/**
 * Synchronous, literal-only checks (no DNS). Safe to call anywhere; webhook
 * destinations additionally go through {@link assertSafeWebhookUrl}.
 */
export function assertSafePublicUrl(rawUrl: string, options: SafeUrlOptions = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new InputValidationError('Invalid URL');
  }

  if (options.requireHttps) {
    if (parsed.protocol !== 'https:') throw new InputValidationError('Only https URLs are allowed');
  } else if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new InputValidationError('Only http and https URLs are allowed');
  }

  if (parsed.username || parsed.password) {
    throw new InputValidationError('URLs with embedded credentials are not allowed');
  }

  if (isUnsafeHostnameLiteral(normalizeHostname(parsed.hostname))) {
    throw new InputValidationError('URL host is not allowed');
  }

  return parsed;
}

export interface SafeWebhookTarget {
  url: URL;
  /** Every address the host resolved to; all were validated and are the ONLY ones the request may connect to. */
  addresses: string[];
}

/**
 * Full webhook destination check: HTTPS-only, literal host rules, then DNS
 * resolution with EVERY resolved address validated. Callers must connect to
 * `addresses` (see safe-http.ts) rather than re-resolving the name, which is
 * what prevents DNS rebinding between this check and the request.
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<SafeWebhookTarget> {
  const url = assertSafePublicUrl(rawUrl, { requireHttps: true });
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new InputValidationError('URL port is not allowed');
  }

  const host = normalizeHostname(url.hostname);
  if (isIP(host)) return { url, addresses: [host] }; // literal already validated above

  let resolved: Array<{ address: string }>;
  try {
    resolved = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new HostResolutionError('Webhook host could not be resolved');
  }
  const addresses = resolved.map((r) => r.address);
  if (addresses.length === 0) throw new HostResolutionError('Webhook host could not be resolved');
  if (addresses.some(isUnsafeIp)) {
    throw new InputValidationError('Webhook host resolves to a disallowed address');
  }
  return { url, addresses };
}
