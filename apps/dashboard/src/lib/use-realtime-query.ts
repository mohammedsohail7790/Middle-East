"use client";

import { useEffect, useRef } from "react";
import { useDebouncedValue } from "./use-debounced-value";
import { useDashboardSync, type DashboardSyncScope } from "./dashboard-sync";

/**
 * Refetch list data when filters/search change (debounced) and when dashboard push/SSE updates scopes.
 */
export function useRealtimeQuery(
  scopes: DashboardSyncScope[],
  load: (opts?: { silent?: boolean }) => void | Promise<void>,
  queryKey: string,
  options?: { debounceMs?: number; pollMs?: number; pollOnlyWhenDisconnected?: boolean }
) {
  const debouncedKey = useDebouncedValue(queryKey, options?.debounceMs ?? 350);
  const loadRef = useRef(load);
  loadRef.current = load;
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const isRefresh = hasLoadedRef.current;
    void loadRef.current(isRefresh ? { silent: true } : undefined);
    hasLoadedRef.current = true;
  }, [debouncedKey]);

  useDashboardSync(scopes, () => void loadRef.current({ silent: true }), {
    pollMs: options?.pollMs,
    pollOnlyWhenDisconnected: options?.pollOnlyWhenDisconnected ?? Boolean(options?.pollMs),
  });
}
