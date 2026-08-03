"use client";

import { api } from "./api";

const CACHE_KEY = "calliq_dashboard_home_v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

export type CachedMetrics = {
  totalCalls: number;
  leads: number;
  conversionRate: number;
  /** AI response latency in ms (was incorrectly named avgLatency before) */
  avgResponseLatency: number;
  /** Average call duration in seconds */
  avgCallDuration: number;
};

export type CachedVolumeDay = { day: string; calls: number; leads: number };

export type CachedCall = {
  id: string;
  call_sid: string;
  transcript?: string | null;
  duration_ms: number;
  outcome: string | null;
  created_at: string;
};

export type DashboardHomeCache = {
  tenantId: string;
  metrics: CachedMetrics | null;
  calls: CachedCall[];
  chartData: CachedVolumeDay[];
  savedAt: number;
};

function readRaw(allowStale = false): DashboardHomeCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardHomeCache;
    if (!parsed?.tenantId) return null;
    if (!allowStale && Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readDashboardHomeCache(
  tenantId: string | null,
  options?: { allowStale?: boolean }
): DashboardHomeCache | null {
  if (!tenantId) return null;
  const cached = readRaw(options?.allowStale);
  if (!cached || cached.tenantId !== tenantId) return null;
  return cached;
}

export function writeDashboardHomeCache(
  tenantId: string,
  data: Omit<DashboardHomeCache, "tenantId" | "savedAt">
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: DashboardHomeCache = {
      tenantId,
      metrics: data.metrics,
      calls: data.calls,
      chartData: data.chartData,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearDashboardHomeCache(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated Use fetchDashboardBootstrap — single request replaces 5+ parallel calls. */
export async function prefetchDashboardShell(tenantId: string): Promise<void> {
  const { fetchDashboardBootstrap } = await import("./dashboard-bootstrap");
  await fetchDashboardBootstrap(tenantId);
}

/** Warm overview data right after auth — speeds first paint after login. */
export async function prefetchDashboardHome(tenantId: string): Promise<void> {
  try {
    const [metricsRes, callsRes, volumeRes] = await Promise.allSettled([
      api.get<CachedMetrics>("/dashboard/metrics"),
      api.get<CachedCall[]>("/calls"),
      api.get<CachedVolumeDay[]>("/dashboard/call-volume"),
    ]);

    const rawMetrics = metricsRes.status === "fulfilled" ? metricsRes.value : null;
    const metrics: CachedMetrics | null = rawMetrics
      ? {
          totalCalls: rawMetrics.totalCalls,
          leads: rawMetrics.leads,
          conversionRate: rawMetrics.conversionRate,
          avgResponseLatency: (rawMetrics as any).avgResponseLatency ?? (rawMetrics as any).avgLatency ?? 0,
          avgCallDuration: (rawMetrics as any).avgCallDuration ?? 0,
        }
      : null;
    let calls: CachedCall[] = [];
    if (callsRes.status === "fulfilled") {
      const raw = callsRes.value;
      calls = Array.isArray(raw) ? raw.slice(0, 6) : [];
    }
    const chartData =
      volumeRes.status === "fulfilled" && Array.isArray(volumeRes.value)
        ? volumeRes.value
        : [];

    writeDashboardHomeCache(tenantId, { metrics, calls, chartData });
  } catch {
    /* prefetch is best-effort */
  }
}
