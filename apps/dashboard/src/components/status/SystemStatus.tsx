"use client";

import { useCallback, useEffect, useState } from "react";

type Check = { id: string; label: string; state: "checking" | "up" | "down"; ms?: number };

const GATEWAY = (process.env.NEXT_PUBLIC_GATEWAY_API_URL || "https://gateway.hallaai.com").replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");

const INITIAL: Check[] = [
  { id: "calls", label: "Answering calls and messages", state: "checking" },
  { id: "data", label: "Saving your data (database and cache)", state: "checking" },
  { id: "site", label: "Website and dashboard", state: "checking" },
];

async function timed(url: string, timeoutMs = 15_000): Promise<{ ok: boolean; ms: number; json?: { ready?: boolean } }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    let json: { ready?: boolean } | undefined;
    try {
      json = await res.clone().json();
    } catch {
      json = undefined;
    }
    return { ok: res.ok, ms: Date.now() - t0, json };
  } catch {
    return { ok: false, ms: Date.now() - t0 };
  }
}

/** A live view of the same three checks the uptime monitor runs. It reads the state from the visitor's own browser right now; it keeps no history. */
export function SystemStatus({ refreshMs = 30_000 }: { refreshMs?: number }) {
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const run = useCallback(async () => {
    const [alive, ready, site] = await Promise.all([timed(`${GATEWAY}/health`), timed(`${GATEWAY}/ready`), timed("/")]);
    setChecks([
      { id: "calls", label: INITIAL[0].label, state: alive.ok ? "up" : "down", ms: alive.ms },
      // /ready answers 503 with ready:false when the database or Redis is unreachable.
      { id: "data", label: INITIAL[1].label, state: ready.ok && ready.json?.ready === true ? "up" : "down", ms: ready.ms },
      { id: "site", label: INITIAL[2].label, state: site.ok ? "up" : "down", ms: site.ms },
    ]);
    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    void run();
    const timer = setInterval(() => void run(), refreshMs);
    return () => clearInterval(timer);
  }, [run, refreshMs]);

  const known = checks.filter((c) => c.state !== "checking");
  const allUp = known.length === checks.length && known.every((c) => c.state === "up");
  const anyDown = known.some((c) => c.state === "down");

  return (
    <div>
      <p role="status" className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${anyDown ? "bg-red-50 text-red-700" : allUp ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
        {anyDown ? "Something is not working right now. We are alerted automatically." : allUp ? "Everything is working." : "Checking…"}
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {checks.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>{c.label}</span>
            <span className={c.state === "up" ? "text-emerald-700" : c.state === "down" ? "text-red-700" : "text-muted-foreground"}>
              {c.state === "checking" ? "Checking…" : c.state === "up" ? `Working · ${c.ms} ms` : "Not responding"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {checkedAt ? `Checked ${checkedAt.toLocaleTimeString()} from your browser, and again every ${Math.round(refreshMs / 1000)} seconds.` : "Running the checks from your browser."} This page shows the current state only, not history.
      </p>
    </div>
  );
}
