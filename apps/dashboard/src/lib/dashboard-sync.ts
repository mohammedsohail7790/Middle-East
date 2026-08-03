"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveDashboardMetrics } from "./realtime";
import { subscribeDashboardStreamConnected } from "./dashboard-stream-state";

/** Poll interval when SSE is disconnected (Vercel proxy may buffer streams). */
export const DASHBOARD_POLL_MS = 45_000;

/** Scopes that dashboard pages can subscribe to for live refresh */
export type DashboardSyncScope =
  | "metrics"
  | "calls"
  | "leads"
  | "calendar"
  | "sms"
  | "analytics"
  | "billing"
  | "phone"
  | "knowledge"
  | "integrations"
  | "settings"
  | "team"
  | "config";

const listeners = new Set<(scopes: DashboardSyncScope[]) => void>();

const NOTIFY_MIN_MS = 3000;
let lastNotifyAt = 0;
let lastNotifyKey = "";

export function notifyDashboardSync(
  scopes: DashboardSyncScope | DashboardSyncScope[],
  options?: { immediate?: boolean }
) {
  const list = Array.isArray(scopes) ? scopes : [scopes];
  const unique = [...new Set(list)].sort();
  if (unique.length === 0) return;

  const key = unique.join(",");
  const now = Date.now();
  if (
    !options?.immediate &&
    key === lastNotifyKey &&
    now - lastNotifyAt < NOTIFY_MIN_MS
  ) {
    return;
  }
  lastNotifyAt = now;
  lastNotifyKey = key;

  listeners.forEach((fn) => {
    try {
      fn(unique);
    } catch {
      /* listener error must not break bus */
    }
  });
}

export function subscribeDashboardSync(
  listener: (scopes: DashboardSyncScope[]) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Skip notify when SSE heartbeat only updates timestamps / live call durations */
export function metricsSnapshotChanged(
  prev: LiveDashboardMetrics | null,
  next: LiveDashboardMetrics
): boolean {
  if (!prev) return true;
  if (next.totalCalls !== prev.totalCalls || next.callsToday !== prev.callsToday) return true;
  if (next.totalLeads !== prev.totalLeads || next.leadsToday !== prev.leadsToday) return true;
  if (next.activeCalls !== prev.activeCalls) return true;
  const prevChanged = (prev as LiveDashboardMetrics & { changed?: string[] }).changed ?? [];
  const nextChanged = (next as LiveDashboardMetrics & { changed?: string[] }).changed ?? [];
  if (prevChanged.join(",") !== nextChanged.join(",")) return true;
  return false;
}

/** Infer what changed from consecutive SSE metric snapshots */
export function scopesFromMetricsDelta(
  prev: LiveDashboardMetrics | null,
  next: LiveDashboardMetrics
): DashboardSyncScope[] {
  const scopes = new Set<DashboardSyncScope>();

  if (!prev) {
    return [...scopes];
  }

  if (next.totalCalls !== prev.totalCalls || next.callsToday !== prev.callsToday) {
    scopes.add("calls");
    scopes.add("metrics");
    scopes.add("analytics");
  }
  if (next.totalLeads !== prev.totalLeads || next.leadsToday !== prev.leadsToday) {
    scopes.add("leads");
    scopes.add("metrics");
    scopes.add("analytics");
  }
  if (next.activeCalls !== prev.activeCalls) {
    scopes.add("calls");
    scopes.add("metrics");
    if (next.activeCalls < prev.activeCalls) {
      scopes.add("calendar");
      scopes.add("analytics");
    }
  }

  const serverChanged = (next as LiveDashboardMetrics & { changed?: string[] }).changed;
  if (Array.isArray(serverChanged)) {
    for (const s of serverChanged) {
      if (isSyncScope(s)) scopes.add(s);
    }
  }

  return [...scopes];
}

/** Map instant SSE push payloads to dashboard sync scopes */
export function scopesFromPushEvent(changed: string[]): DashboardSyncScope[] {
  const scopes = new Set<DashboardSyncScope>();
  for (const s of changed) {
    if (isSyncScope(s)) scopes.add(s);
  }
  return [...scopes];
}

function isSyncScope(s: string): s is DashboardSyncScope {
  return (
    s === "metrics" ||
    s === "calls" ||
    s === "leads" ||
    s === "calendar" ||
    s === "sms" ||
    s === "analytics" ||
    s === "billing" ||
    s === "phone" ||
    s === "knowledge" ||
    s === "integrations" ||
    s === "settings" ||
    s === "team" ||
    s === "config"
  );
}

/** Cross-page refresh after any dashboard mutation */
export function syncDashboardAll() {
  notifyDashboardSync([
    "metrics",
    "calls",
    "leads",
    "calendar",
    "sms",
    "analytics",
    "billing",
    "phone",
    "knowledge",
    "integrations",
    "settings",
    "config",
  ]);
}

/**
 * Refetch when SSE (or manual notify) touches any of the given scopes.
 * pollMs: periodic refetch while tab is visible.
 * pollOnlyWhenDisconnected: pollMs runs only when the dashboard SSE stream is down.
 */
export function useDashboardSync(
  scopes: DashboardSyncScope[],
  onRefresh: () => void,
  options?: { pollMs?: number; debounceMs?: number; pollOnlyWhenDisconnected?: boolean }
) {
  const scopeKey = scopes.slice().sort().join(",");
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const debounceMs = options?.debounceMs ?? 350;
  const pollOnlyWhenDisconnected = options?.pollOnlyWhenDisconnected ?? false;
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    if (!pollOnlyWhenDisconnected) return;
    return subscribeDashboardStreamConnected(setStreamConnected);
  }, [pollOnlyWhenDisconnected]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return subscribeDashboardSync((changed) => {
      if (!changed.some((c) => scopes.includes(c))) return;
      clearTimeout(timer);
      timer = setTimeout(() => onRefreshRef.current(), debounceMs);
    });
  }, [scopeKey, scopes, debounceMs]);

  useEffect(() => {
    const ms = options?.pollMs;
    if (!ms || ms < 5000) return;
    if (pollOnlyWhenDisconnected && streamConnected) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const tick = () => onRefreshRef.current();
    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(tick, ms);
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      start();
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scopeKey, options?.pollMs, pollOnlyWhenDisconnected, streamConnected]);
}
