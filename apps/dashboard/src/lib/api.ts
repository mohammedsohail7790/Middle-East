import { supabase } from "./supabase";
import { getTenantId, setTenantId } from "./store";
import {
  cachedGet,
  clearApiGetCache,
  invalidateApiGetCache,
} from "./api-get-cache";
import { SUPPORT_EMAIL } from "./integration-support";
import { warmGatewayWhenReady } from "./gateway-warm";

/** Live gateway — use localhost only when explicitly set in .env.local */
const DEFAULT_GATEWAY_URL = "https://gateway.hallaai.com";

const BASE = (
  process.env.NEXT_PUBLIC_GATEWAY_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  DEFAULT_GATEWAY_URL
).trim();

/** Server-side or trusted scripts only — never expose in browser bundles. */
const SERVER_API_KEY = process.env.VOICE_INTERNAL_API_KEY;

let cachedCsrfToken: string | null = null;

type AuthHeaderCache = {
  headers: Record<string, string>;
  expiresAt: number;
};

let cachedAuthHeaders: AuthHeaderCache | null = null;
const AUTH_CACHE_MS = 45_000;

export function clearAuthCache(): void {
  cachedAuthHeaders = null;
  clearCsrfCache();
  clearApiGetCache();
}

function isCsrfError(status: number, msg: string): boolean {
  return status === 403 && /csrf/i.test(msg);
}

async function fetchCsrfToken(
  headers: Record<string, string>
): Promise<string | null> {
  const apiBase = resolveApiBase();
  const res = await fetch(`${apiBase}/api/v1/dashboard/csrf-token`, { headers });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { csrfToken?: string } };
  return json?.data?.csrfToken || null;
}

async function attachCsrfHeader(headers: Record<string, string>): Promise<void> {
  if (!headers.Authorization || typeof window === "undefined") return;
  if (!cachedCsrfToken) {
    cachedCsrfToken = await fetchCsrfToken(headers);
  }
  if (cachedCsrfToken) {
    headers["X-CSRF-Token"] = cachedCsrfToken;
  }
}

/** Warm CSRF before first save / voice preview (dashboard layout + agent page). */
export async function prefetchCsrfToken(): Promise<void> {
  if (typeof window === "undefined") return;
  const headers = await getAuthHeaders();
  if (!headers.Authorization) return;
  cachedCsrfToken = await fetchCsrfToken(headers);
}

export function clearCsrfCache(): void {
  cachedCsrfToken = null;
}

/** Shared CSRF attachment for api + assistant streaming. */
export async function attachCsrfToHeaders(headers: Record<string, string>): Promise<void> {
  await attachCsrfHeader(headers);
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedAuthHeaders && cachedAuthHeaders.expiresAt > now) {
    return { ...cachedAuthHeaders.headers };
  }

  let { data } = await supabase.auth.getSession();
  const session = data.session;
  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  const sessionStale = !session?.access_token || expiresAtMs < Date.now() + 120_000;
  if (sessionStale && typeof window !== "undefined") {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) data = refreshed.data;
  }
  const activeSession = data.session;
  const user = activeSession?.user;

  const fromMeta =
    (user?.user_metadata?.tenant_id as string | undefined) ||
    (user?.app_metadata?.tenant_id as string | undefined);

  // JWT tenant wins over localStorage — stale calliq_tenant_id caused 403 on all pages
  let tenantId = fromMeta || getTenantId();
  if (fromMeta) {
    setTenantId(fromMeta);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const accessToken = activeSession?.access_token;
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
    // Hint for legacy routes (calendar/oauth auth-url) — gateway still validates JWT tenant.
    if (tenantId) {
      headers["x-tenant-id"] = tenantId;
    }
    cachedAuthHeaders = {
      headers: { ...headers },
      expiresAt: now + AUTH_CACHE_MS,
    };
    return headers;
  }

  if (tenantId) {
    headers["x-tenant-id"] = tenantId;
  }

  if (typeof window === "undefined" && SERVER_API_KEY) {
    headers["x-internal-api-key"] = SERVER_API_KEY;
  }

  cachedAuthHeaders = {
    headers: { ...headers },
    expiresAt: now + AUTH_CACHE_MS,
  };
  return headers;
}

function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    return getGatewayBaseUrl();
  }
  return BASE.replace(/\/$/, "").trim();
}

function resolveDirectGatewayBase(): string {
  return (
    process.env.NEXT_PUBLIC_GATEWAY_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_GATEWAY_URL
  )
    .trim()
    .replace(/\/$/, "");
}

function gatewayFetchBases(primary: string): string[] {
  const direct = resolveDirectGatewayBase();
  const normalize = (u: string) => u.replace(/\/$/, "");
  const bases = [normalize(primary)];
  if (
    typeof window !== "undefined" &&
    normalize(primary) === normalize(window.location.origin) &&
    normalize(direct) !== normalize(primary)
  ) {
    bases.push(normalize(direct));
  }
  return bases;
}

/** Prefer Render direct URL on production — Vercel proxy can lag during cold starts. */
function healthCheckBases(primary: string): string[] {
  const bases = gatewayFetchBases(primary);
  if (typeof window === "undefined") return bases;
  const host = window.location.hostname;
  const isProdHost =
    host.includes("hallaai.com") || host.endsWith(".vercel.app");
  if (!isProdHost) return bases;
  const direct = resolveDirectGatewayBase().replace(/\/$/, "");
  if (!bases.includes(direct)) bases.push(direct);
  return [direct, ...bases.filter((b) => b !== direct)];
}

function isLocalDashboardHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function isVercelPreviewDashboardHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith(".vercel.app") &&
    (host.includes("call-iq-dashboard") || host.includes("calliqlabs"))
  );
}

function isNetworkFetchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg === "Failed to fetch" || /fetch|network|load failed/i.test(msg);
}

function unreachableApiMessage(_apiBase?: string): string {
  const gateway = resolveDirectGatewayBase();
  if (isLocalDashboardHost()) {
    return "Cannot reach the Halla AI API. From the project folder run npm run dev and keep that terminal open, then use http://localhost:3000.";
  }
  if (isVercelPreviewDashboardHost()) {
    return `Cannot reach the Halla AI backend (${gateway}). Use https://app.hallaai.com for production, or wait for the gateway to wake up and refresh.`;
  }
  return `Cannot reach the Halla AI backend (${gateway}). The server may be waking up — wait 30 seconds and refresh. If this keeps happening, contact ${SUPPORT_EMAIL}.`;
}

async function parseHttpErrorBody(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    return errBody.error || errBody.message || `API ${res.status}`;
  }
  const text = await res.text().catch(() => "");
  return text.slice(0, 200) || `API ${res.status}`;
}

async function fetchBlobFromGateway(
  path: string,
  options: RequestInit,
  primaryBase: string,
  csrfRetried: boolean,
  retry: () => Promise<Blob>
): Promise<Blob> {
  let res: Response;
  try {
    res = await fetchFromGateway(path, options, primaryBase);
  } catch (err) {
    if (isNetworkFetchError(err)) {
      throw new Error(unreachableApiMessage(primaryBase));
    }
    throw err instanceof Error ? err : new Error(String(err));
  }

  if (!res.ok) {
    const errMsg = await parseHttpErrorBody(res);
    if (!csrfRetried && isCsrfError(res.status, errMsg)) {
      cachedCsrfToken = null;
      await prefetchCsrfToken();
      return retry();
    }
    if (res.status === 403) {
      throw new Error(
        errMsg.includes("CSRF")
          ? errMsg
          : "Request blocked (CSRF or permissions). Refresh the page and try again."
      );
    }
    throw new Error(errMsg);
  }

  return res.blob();
}

const GATEWAY_RETRY_DELAYS_MS = [0, 400];
const GATEWAY_READ_TIMEOUT_MS = 12_000;
const GATEWAY_BOOTSTRAP_TIMEOUT_MS = 20_000;
const GATEWAY_INTEGRATIONS_TIMEOUT_MS = 15_000;
/** After wake poll, one longer attempt for Render cold start. */
const GATEWAY_COLD_START_TIMEOUT_MS = 25_000;
/** Workspace creation can run billing + AI seed during gateway wake-up. */
const GATEWAY_ONBOARDING_TIMEOUT_MS = 35_000;
const OAUTH_FETCH_TIMEOUT_MS = 12_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  }
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    if (/aborted|timeout|timed out/i.test(err.message)) return true;
  }
  return false;
}

function gatewayTimeoutMessage(): string {
  return "Request timed out — the server may still be waking up. Wait a moment and click Try again, or refresh the page.";
}

/** Normalize fetch errors for dashboard UI (dedupe-friendly). */
export function humanizeApiError(err: unknown): string {
  if (isAbortError(err)) return gatewayTimeoutMessage();
  const msg = err instanceof Error ? err.message : String(err);
  if (/signal timed out|timed out/i.test(msg)) return gatewayTimeoutMessage();
  if (isNetworkFetchError(err)) return unreachableApiMessage(resolveApiBase());
  return msg;
}

function withGatewayTimeout(options: RequestInit, ms: number): RequestInit {
  const timeoutSignal = AbortSignal.timeout(ms);
  const userSignal = options.signal;
  if (!userSignal) {
    return { ...options, signal: timeoutSignal };
  }
  if (typeof AbortSignal.any === "function") {
    return { ...options, signal: AbortSignal.any([userSignal, timeoutSignal]) };
  }
  return { ...options, signal: timeoutSignal };
}

function fetchBasesFor(path: string, primary: string): string[] {
  const normalized = path.split("?")[0];
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isProdHost = host.includes("hallaai.com") || host.endsWith(".vercel.app");
    const directOnly =
      isProdHost &&
      (normalized === "/dashboard/bootstrap" ||
        normalized.startsWith("/integrations/") ||
        normalized.startsWith("/billing/"));
    if (directOnly) {
      return [resolveDirectGatewayBase().replace(/\/$/, "")];
    }
  }
  return healthCheckBases(primary);
}

function gatewayTimeoutFor(path: string, method: string): number {
  const normalized = path.split("?")[0];
  if (method === "POST" && (normalized === "/tenants" || normalized === "/tenants/" || normalized === "/organizations" || normalized === "/organizations/")) {
    return GATEWAY_ONBOARDING_TIMEOUT_MS;
  }
  if (
    normalized.startsWith("/onboarding/") ||
    normalized.startsWith("/tenants/onboarding-status") ||
    normalized === "/dashboard/bootstrap"
  ) {
    return GATEWAY_BOOTSTRAP_TIMEOUT_MS;
  }
  if (normalized.startsWith("/integrations/") || normalized.startsWith("/billing/")) {
    return GATEWAY_INTEGRATIONS_TIMEOUT_MS;
  }
  return GATEWAY_READ_TIMEOUT_MS;
}

async function fetchFromGateway(
  path: string,
  options: RequestInit,
  primaryBase: string
): Promise<Response> {
  const bases = fetchBasesFor(path, primaryBase);
  const method = (options.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  const timeoutMs = gatewayTimeoutFor(path, method);
  let lastErr: unknown;

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    const isLastBase = i === bases.length - 1;
    const maxAttempts = isLastBase ? Math.min(2, GATEWAY_RETRY_DELAYS_MS.length) : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await sleep(GATEWAY_RETRY_DELAYS_MS[attempt] ?? 500);
      try {
        const res = await fetch(
          `${base}/api/v1${path}`,
          withGatewayTimeout(options, timeoutMs)
        );
        if (
          !isLastBase &&
          (res.status === 502 ||
            res.status === 503 ||
            res.status === 504 ||
            (res.status >= 500 && res.status < 600))
        ) {
          break;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (!isLastBase) break;
        if (isAbortError(err)) break;
        if (attempt < maxAttempts - 1) continue;
      }
    }
  }

  if (isAbortError(lastErr) && isRead) {
    await warmGatewayWhenReady(30_000);
    const base = bases[bases.length - 1] ?? primaryBase;
    try {
      return await fetch(
        `${base}/api/v1${path}`,
        withGatewayTimeout(options, GATEWAY_COLD_START_TIMEOUT_MS)
      );
    } catch (coldErr) {
      lastErr = coldErr;
    }
  }

  if (isAbortError(lastErr)) {
    throw new Error(gatewayTimeoutMessage());
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Network error"));
}

/** Single direct gateway call for OAuth start — avoids multi-base retry hangs on Connect. */
async function getOAuthRedirectUrl(path: string): Promise<string> {
  const headers = await getAuthHeaders();
  const base = resolveDirectGatewayBase();
  let res: Response;
  try {
    res = await fetch(
      `${base}/api/v1${path}`,
      withGatewayTimeout({ method: "GET", headers }, OAUTH_FETCH_TIMEOUT_MS)
    );
  } catch (err) {
    if (isAbortError(err)) throw new Error(gatewayTimeoutMessage());
    if (isNetworkFetchError(err)) throw new Error(unreachableApiMessage(base));
    throw err instanceof Error ? err : new Error(String(err));
  }

  if (!res.ok) {
    const msg = await parseHttpErrorBody(res);
    if (res.status === 401) throw new Error("Session expired — please sign in again.");
    if (res.status === 403) throw new Error(msg || "Access denied — check your workspace tenant.");
    if (res.status === 501 || /not configured/i.test(msg)) {
      throw new Error(msg || "OAuth not configured on the server");
    }
    throw new Error(msg);
  }

  const json = (await res.json()) as { data?: { authUrl?: string; url?: string }; authUrl?: string; url?: string };
  const payload = json?.data ?? json;
  const url = payload?.authUrl || payload?.url;
  if (!url) throw new Error("No authorization URL returned");
  return url;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  csrfRetried = false
): Promise<T> {
  const headers = await getAuthHeaders();
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    await attachCsrfHeader(headers);
  }
  const apiBase = resolveApiBase();
  const fetchOptions: RequestInit = {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
  };
  let res: Response;
  try {
    res = await fetchFromGateway(path, fetchOptions, apiBase);
  } catch (err) {
    if (isAbortError(err)) throw new Error(gatewayTimeoutMessage());
    if (isNetworkFetchError(err)) {
      throw new Error(unreachableApiMessage(apiBase));
    }
    throw err instanceof Error ? err : new Error(String(err));
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let body: Record<string, unknown> = {};
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      /* non-JSON (e.g. Next proxy "Internal Server Error" when gateway is down) */
    }
    const msg =
      (typeof body.error === "string" ? body.error : null) ||
      (typeof body.message === "string" ? body.message : null) ||
      (raw && raw.length < 200 ? raw : null) ||
      `API ${res.status}`;
    if (res.status === 401) {
      throw new Error("Session expired — please sign in again.");
    }
    if (res.status === 429) {
      const retryAfter =
        typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined;
      const err = new Error(
        retryAfter
          ? `Too many requests — wait ${retryAfter}s and refresh.`
          : "Too many requests — wait a minute and refresh."
      ) as Error & { status?: number; retryAfterSeconds?: number };
      err.status = 429;
      err.retryAfterSeconds = retryAfter;
      throw err;
    }
    if (res.status === 503 && /billing|stripe/i.test(msg || "")) {
      throw new Error(msg || "Billing not configured on the server.");
    }
    if (res.status === 403) {
      if (isCsrfError(res.status, msg || "") && !csrfRetried) {
        cachedCsrfToken = null;
        await prefetchCsrfToken();
        return request<T>(path, options, true);
      }
      if (/csrf/i.test(msg || "")) {
        throw new Error("Security check failed — refresh the page and try again.");
      }
      throw new Error(msg || "Access denied — check your workspace tenant.");
    }
    if (res.status === 500 && apiBase.includes("localhost")) {
      throw new Error(
        "API unavailable — start the gateway: npm run dev:gateway (or npm run dev for both)."
      );
    }
    throw new Error(msg);
  }

  const json = await res.json();
  return (json?.data ?? json) as T;
}

/** Normalize list endpoints that may return { items } or arrays */
export function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["numbers", "items", "rows", "data"]) {
      if (Array.isArray(o[key])) return o[key] as T[];
    }
  }
  return [];
}

export function getGatewayBaseUrl(): string {
  if (typeof window !== "undefined") {
    const sameOrigin = process.env.NEXT_PUBLIC_GATEWAY_API_URL?.includes("localhost:3000");
    if (sameOrigin || process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API === "true") {
      return window.location.origin;
    }
  }
  return BASE.replace(/\/$/, "").trim();
}

/** True when the dashboard can reach the gateway (via Next proxy /health in local dev). */
export async function isGatewayReachable(): Promise<boolean> {
  const primary =
    typeof window !== "undefined" ? window.location.origin : resolveApiBase();
  for (const base of healthCheckBases(primary)) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/health`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) return true;
    } catch {
      /* try next base */
    }
  }
  return false;
}

export function gatewayUnreachableMessage(): string {
  const apiBase =
    typeof window !== "undefined" ? window.location.origin : resolveApiBase();
  return unreachableApiMessage(apiBase);
}

function httpToWsUrl(url: string): string {
  if (url.startsWith("https://")) return url.replace("https://", "wss://");
  if (url.startsWith("http://")) return url.replace("http://", "ws://");
  return url;
}

/** Render gateway WS — used when REST is same-origin proxied (Vercel) but WS cannot be. */
function resolveDirectGatewayWsUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_GATEWAY_WS_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return httpToWsUrl(fromEnv);
  const apiUrl = (
    process.env.NEXT_PUBLIC_GATEWAY_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_GATEWAY_URL
  )
    .trim()
    .replace(/\/$/, "");
  return httpToWsUrl(apiUrl);
}

export function getGatewayWsBaseUrl(): string {
  const direct = process.env.NEXT_PUBLIC_GATEWAY_WS_URL?.trim().replace(/\/$/, "");
  if (direct) return httpToWsUrl(direct);

  if (typeof window !== "undefined") {
    const sameOrigin =
      process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API === "true" ||
      process.env.NEXT_PUBLIC_GATEWAY_API_URL?.includes("localhost:3000");
    if (sameOrigin) {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        return `ws://${host === "127.0.0.1" ? "127.0.0.1" : "localhost"}:3003`;
      }
      // Vercel rewrites do not proxy WebSockets — connect to Render directly.
      return resolveDirectGatewayWsUrl();
    }
  }

  return resolveDirectGatewayWsUrl();
}

/** Resolve tenant id for settings and legacy pages */
export async function resolveTenantId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  const fromMeta =
    (user?.user_metadata?.tenant_id as string | undefined) ||
    (user?.app_metadata?.tenant_id as string | undefined);
  if (fromMeta) {
    setTenantId(fromMeta);
    return fromMeta;
  }
  const stored = getTenantId();
  if (stored) return stored;
  const me = await request<{ id?: string }>("/tenants/me");
  const id = me?.id;
  if (!id) throw new Error("Tenant not configured — complete onboarding first.");
  setTenantId(id);
  return id;
}

export interface PaginatedList<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

async function requestListRaw<T>(
  path: string,
  params?: Record<string, string>,
  csrfRetried = false
): Promise<PaginatedList<T>> {
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const headers = await getAuthHeaders();
  const apiBase = resolveApiBase();
  const res = await fetchFromGateway(path + qs, { headers }, apiBase);
  if (!res.ok) {
    const msg = await parseHttpErrorBody(res);
    if (res.status === 401) {
      throw new Error("Session expired — please sign in again.");
    }
    if (res.status === 429) {
      throw new Error("Too many requests — wait a minute and refresh.");
    }
    if (res.status === 403 && isCsrfError(res.status, msg) && !csrfRetried) {
      clearCsrfCache();
      await prefetchCsrfToken();
      return requestListRaw<T>(path, params, true);
    }
    throw new Error(msg);
  }
  const json = (await res.json()) as {
    data?: unknown;
    limit?: number;
    offset?: number;
    total?: number;
    hasMore?: boolean;
  };
  const items = asArray<T>(json.data ?? json);
  const limit = json.limit ?? items.length;
  const offset = json.offset ?? 0;
  const total = json.total ?? items.length;
  return {
    items,
    limit,
    offset,
    total,
    hasMore: json.hasMore ?? offset + items.length < total,
  };
}

async function requestList<T>(
  path: string,
  params?: Record<string, string>
): Promise<PaginatedList<T>> {
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const cachePath = `${path}${qs}`;
  return cachedGet(cachePath, () => requestListRaw<T>(path, params));
}

function invalidateAfterMutation(path: string) {
  const base = path.split("?")[0];
  invalidateApiGetCache(base.split("/").slice(0, 2).join("/") || "/");
  if (base.startsWith("/leads")) invalidateApiGetCache("/leads");
  if (base.startsWith("/crm")) invalidateApiGetCache("/crm");
  if (base.startsWith("/calls")) invalidateApiGetCache("/calls");
  if (base.startsWith("/dashboard")) invalidateApiGetCache("/dashboard");
  if (base.startsWith("/integrations")) invalidateApiGetCache("/integrations");
  if (base.startsWith("/ai-config")) invalidateApiGetCache("/ai-config");
  if (base.startsWith("/tenants")) invalidateApiGetCache("/tenants");
  if (base.startsWith("/organizations")) invalidateApiGetCache("/organizations");
  if (base.startsWith("/analytics")) invalidateApiGetCache("/analytics");
}

export const api = {
  get: <T>(path: string, options?: { fresh?: boolean }) =>
    cachedGet(path, () => request<T>(path), options),
  getOAuthRedirectUrl: (path: string) => getOAuthRedirectUrl(path),
  getList: <T>(path: string, params?: Record<string, string>) => requestList<T>(path, params),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }).then((data) => {
      invalidateAfterMutation(path);
      return data;
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }).then((data) => {
      invalidateAfterMutation(path);
      return data;
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }).then((data) => {
      invalidateAfterMutation(path);
      return data;
    }),
  del: <T>(path: string) =>
    request<T>(path, { method: "DELETE" }).then((data) => {
      invalidateAfterMutation(path);
      return data;
    }),
  blob: async (path: string): Promise<Blob> => {
    const headers = await getAuthHeaders();
    const apiBase = resolveApiBase();
    return fetchBlobFromGateway(path, { headers }, apiBase, false, (): Promise<Blob> =>
      api.blob(path)
    );
  },
  downloadBlob: async (path: string, filename: string) => {
    const blob = await api.blob(path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  /** OpenAI TTS preview — Next.js proxy on Vercel, direct gateway fallback on preview/CORS paths. */
  postVoicePreview: async (body: unknown, csrfRetried = false): Promise<Blob> => {
    const headers = await getAuthHeaders();
    await attachCsrfHeader(headers);
    const fetchOptions: RequestInit = {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    };
    const apiBase = resolveApiBase();

    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/dashboard/voice-preview", fetchOptions);
        if (res.ok) return res.blob();
        const errMsg = await parseHttpErrorBody(res);
        if (!csrfRetried && isCsrfError(res.status, errMsg)) {
          cachedCsrfToken = null;
          await prefetchCsrfToken();
          return api.postVoicePreview(body, true);
        }
        if (res.status < 502 || res.status > 504) {
          throw new Error(errMsg);
        }
      } catch (err) {
        if (err instanceof Error && !isNetworkFetchError(err)) {
          throw err;
        }
      }
    }

    return fetchBlobFromGateway(
      "/ai-config/test-voice",
      fetchOptions,
      apiBase,
      csrfRetried,
      () => api.postVoicePreview(body, true)
    );
  },
  postBlob: async (
    path: string,
    body: unknown,
    csrfRetried = false
  ): Promise<Blob> => {
    const headers = await getAuthHeaders();
    await attachCsrfHeader(headers);
    const apiBase = resolveApiBase();
    return fetchBlobFromGateway(
      path,
      { method: "POST", headers, body: JSON.stringify(body) },
      apiBase,
      csrfRetried,
      () => api.postBlob(path, body, true)
    );
  },
};

if (typeof window !== "undefined") {
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session?.access_token) {
      void getAuthHeaders();
    }
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      clearAuthCache();
      return;
    }
    if (session?.access_token) {
      cachedAuthHeaders = null;
      void getAuthHeaders();
    }
  });
}
