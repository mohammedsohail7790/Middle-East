"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDashboardSync, type DashboardSyncScope } from "./dashboard-sync";

/**
 * Standard page loader: fetch on mount + refetch when SSE/push touches scopes.
 */
export function useDashboardPage(
  scopes: DashboardSyncScope[],
  load: () => void | Promise<void>,
  options?: { pollMs?: number; loadOnMount?: boolean; pollOnlyWhenDisconnected?: boolean }
) {
  const loadRef = useRef(load);
  loadRef.current = load;

  const stableLoad = useCallback(() => {
    void loadRef.current();
  }, []);

  useEffect(() => {
    if (options?.loadOnMount !== false) {
      stableLoad();
    }
  }, [stableLoad, options?.loadOnMount]);

  useDashboardSync(scopes, stableLoad, {
    pollMs: options?.pollMs,
    pollOnlyWhenDisconnected: options?.pollOnlyWhenDisconnected ?? Boolean(options?.pollMs),
  });
}
