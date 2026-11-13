"use client";

import { useEffect, useState } from "react";
import { APPROVALS_CHANGED_EVENT, automationsApi } from "./client";

const MIN_GAP_MS = 20_000;
let lastFetch = 0;

/**
 * How many automation actions wait for the owner's yes. One cheap call, made when the page changes (at most every 20 seconds)
 * and again right after the owner answers one. If the call fails the count is simply 0: the sidebar never breaks.
 */
export function usePendingApprovalCount(pathname: string | null | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let live = true;
    const run = (force: boolean) => {
      const now = Date.now();
      if (!force && now - lastFetch < MIN_GAP_MS) return;
      lastFetch = now;
      automationsApi.approvals("pending").then((rows) => live && setCount(Array.isArray(rows) ? rows.length : 0)).catch(() => undefined);
    };
    run(false);
    const onChanged = () => run(true);
    window.addEventListener(APPROVALS_CHANGED_EVENT, onChanged);
    return () => {
      live = false;
      window.removeEventListener(APPROVALS_CHANGED_EVENT, onChanged);
    };
  }, [pathname]);

  return count;
}
