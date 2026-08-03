import { PRODUCTION_SITE_ORIGIN } from "./site-url";

export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

export function isProductionDashboardHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "calliqlabs.com" || h === "www.calliqlabs.com";
}

/** Origin used in auth emails and OAuth return URLs. */
export function resolveAuthOriginFromHostname(
  hostname: string,
  opts?: { proto?: string; port?: string }
): string {
  const h = hostname.toLowerCase();
  if (isLocalHostname(h)) {
    const port = opts?.port || "3000";
    const host = h === "127.0.0.1" ? "127.0.0.1" : "localhost";
    return `http://${host}:${port}`;
  }
  if (isProductionDashboardHostname(h)) {
    return PRODUCTION_SITE_ORIGIN;
  }
  if (h.endsWith(".vercel.app")) {
    const proto = opts?.proto === "http" ? "http" : "https";
    return `${proto}://${hostname}${opts?.port ? `:${opts.port}` : ""}`.replace(/\/$/, "");
  }
  return PRODUCTION_SITE_ORIGIN;
}

export function resolveOriginFromRequestHeaders(headers: Headers): string {
  const hostHeader = (headers.get("x-forwarded-host") || headers.get("host") || "")
    .split(",")[0]
    ?.trim();
  if (!hostHeader) return PRODUCTION_SITE_ORIGIN;

  const [hostname, port] = hostHeader.split(":");
  const proto = (headers.get("x-forwarded-proto") || "https").split(",")[0]?.trim();
  return resolveAuthOriginFromHostname(hostname, { proto, port });
}

export function buildAuthCallbackUrlFromOrigin(origin: string, nextPath = "/dashboard"): string {
  const base = origin.replace(/\/$/, "");
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function buildAuthCallbackUrlForRequest(headers: Headers, nextPath = "/dashboard"): string {
  return buildAuthCallbackUrlFromOrigin(resolveOriginFromRequestHeaders(headers), nextPath);
}

/** Client-side origin for auth redirects (ignores mis-set NEXT_PUBLIC_SITE_URL on production hosts). */
export function getClientAuthOrigin(): string {
  if (typeof window !== "undefined") {
    const { hostname, protocol, port } = window.location;
    return resolveAuthOriginFromHostname(hostname, {
      proto: protocol.replace(":", ""),
      port: port || undefined,
    });
  }
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) {
    return fromEnv.replace(/\/$/, "");
  }
  return PRODUCTION_SITE_ORIGIN;
}
