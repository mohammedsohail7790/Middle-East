"use client";

import { useEffect } from "react";

const RELOAD_KEY = "calliq_chunk_reload_ts";
const RELOAD_COOLDOWN_MS = 30_000;

function isChunkLoadFailure(message: string): boolean {
  return /Loading chunk \d+ failed|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    message
  );
}

/**
 * After a Vercel deploy, clients with an old JS manifest request missing chunks (404).
 * One automatic hard reload usually fixes it.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const tryReload = (message: string) => {
      if (!isChunkLoadFailure(message)) return;
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
      if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      tryReload(event.message || String(event.error));
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "";
      tryReload(message);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
