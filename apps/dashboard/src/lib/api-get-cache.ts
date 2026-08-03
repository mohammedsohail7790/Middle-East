"use client";

import { getTenantId } from "./store";

type CacheEntry = {
  data: unknown;
  savedAt: number;
};

const FRESH_MS = 45_000;
const SESSION_STICKY_MS = 5 * 60_000;
const SESSION_STICKY_PREFIX = "calliq_api_cache_v1|";

/** Paths that survive full page reload (integrations, billing shell). */
const SESSION_STICKY_PATHS = new Set([
  "/integrations/catalog",
  "/integrations/oauth-capabilities",
  "/billing/account-state",
  "/billing/subscription",
]);

function sessionStickyKey(path: string): string {
  return `${SESSION_STICKY_PREFIX}${getTenantId() || "anon"}|${path}`;
}

function readSessionSticky<T>(path: string): T | null {
  if (typeof window === "undefined" || !SESSION_STICKY_PATHS.has(path.split("?")[0])) {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(sessionStickyKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: T };
    if (Date.now() - parsed.savedAt > SESSION_STICKY_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeSessionSticky(path: string, data: unknown): void {
  if (typeof window === "undefined" || !SESSION_STICKY_PATHS.has(path.split("?")[0])) return;
  try {
    sessionStorage.setItem(
      sessionStickyKey(path),
      JSON.stringify({ savedAt: Date.now(), data })
    );
  } catch {
    /* quota / private mode */
  }
}

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function keyFor(path: string, method = "GET"): string {
  return `${getTenantId() || "anon"}|${method}|${path}`;
}

export function readApiGetCache<T>(path: string): T | null {
  const entry = store.get(keyFor(path));
  if (entry) {
    if (Date.now() - entry.savedAt > FRESH_MS) {
      store.delete(keyFor(path));
    } else {
      return entry.data as T;
    }
  }
  const sticky = readSessionSticky<T>(path);
  if (sticky) {
    writeApiGetCache(path, sticky);
    return sticky;
  }
  return null;
}

export function writeApiGetCache(path: string, data: unknown): void {
  store.set(keyFor(path), { data, savedAt: Date.now() });
  writeSessionSticky(path, data);
}

export function invalidateApiGetCache(pathPrefix?: string): void {
  const tid = getTenantId() || "anon";
  const prefix = pathPrefix ? `${tid}|GET|${pathPrefix}` : `${tid}|GET|`;
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

export function clearApiGetCache(): void {
  store.clear();
  inflight.clear();
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.savedAt < FRESH_MS;
}

/**
 * GET cache: only serve fresh hits instantly. Stale/missing always awaits network
 * so React state updates reliably. Dedupes concurrent identical requests.
 */
export async function cachedGet<T>(
  path: string,
  fetcher: () => Promise<T>,
  options?: { fresh?: boolean }
): Promise<T> {
  const key = keyFor(path);

  if (!options?.fresh) {
    const entry = store.get(key);
    if (entry && isFresh(entry)) {
      return entry.data as T;
    }
  }

  if (inflight.has(key)) {
    return inflight.get(key) as Promise<T>;
  }

  const request = fetcher()
    .then((data) => {
      writeApiGetCache(path, data);
      return data;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}
