"use client";

import { useEffect } from "react";
import { ThemeProvider } from "@/lib/theme";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { resolveGatewayBase } from "@/lib/gateway-warm";

const PREWARM_KEY = "halla_gateway_prewarm_at";
const PREWARM_EVERY_MS = 5 * 60 * 1000;

/**
 * The production gateway sleeps when idle (60-80s to wake). Anyone on a marketing or auth page is
 * a likely dashboard visitor, so send one fire-and-forget health ping (throttled per browser) to
 * start the wake-up while they read / type their password.
 */
function prewarmGateway() {
  try {
    const last = Number(sessionStorage.getItem(PREWARM_KEY) || 0);
    if (Date.now() - last < PREWARM_EVERY_MS) return;
    sessionStorage.setItem(PREWARM_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: still ping once */
  }
  void fetch(`${resolveGatewayBase()}/health`, { mode: "no-cors", cache: "no-store", keepalive: true }).catch(() => {});
}

/** Marketing pages must render even when Supabase env vars are unset (preview builds). */
export function MarketingProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    prewarmGateway();
  }, []);

  return (
    <ThemeProvider>
      <ChunkLoadRecovery />
      {children}
    </ThemeProvider>
  );
}
