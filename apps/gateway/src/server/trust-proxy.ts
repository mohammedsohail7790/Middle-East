/**
 * How many proxy hops in front of the gateway to believe when working out the caller's address (req.ip).
 *
 * On Render the chain is: caller -> Render's edge (Cloudflare) -> Render's load balancer -> this app.
 * One hop gives Cloudflare's address; two give the caller's. Entries a caller writes into X-Forwarded-For sit to the
 * left of the ones the proxies add, so they are never believed. Set TRUST_PROXY_HOPS to change it (0 to 5), for example
 * if the service is moved behind a different number of proxies. Anything else falls back to the default.
 */
export const DEFAULT_TRUST_PROXY_HOPS = 2;

export function resolveTrustProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRUST_PROXY_HOPS;
  if (!/^\d+$/.test(raw.trim())) return DEFAULT_TRUST_PROXY_HOPS;
  const n = Number(raw.trim());
  return n >= 0 && n <= 5 ? n : DEFAULT_TRUST_PROXY_HOPS;
}
