const DEFAULT_GATEWAY_URL = "https://call-iq-gateway.onrender.com";

export function resolveGatewayBase(): string {
  return (
    process.env.NEXT_PUBLIC_GATEWAY_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_GATEWAY_URL
  ).replace(/\/$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll /health until OK or maxMs — for Render cold starts (often 15–45s). */
export async function pollGatewayHealth(maxMs = 30_000, intervalMs = 2_000): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const base = resolveGatewayBase();
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`, {
        mode: "cors",
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(5_000, deadline - Date.now())),
      });
      if (res.ok) return true;
    } catch {
      /* gateway still waking */
    }
    if (Date.now() + intervalMs >= deadline) break;
    await sleep(intervalMs);
  }

  return false;
}

let warmInflight: Promise<boolean> | null = null;

/** Shared gateway wake — deduped across login, layout, and API retries. */
export function warmGatewayWhenReady(maxMs = 30_000): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (warmInflight) return warmInflight;

  warmInflight = pollGatewayHealth(maxMs)
    .catch(() => false)
    .finally(() => {
      warmInflight = null;
    });

  return warmInflight;
}

export function warmGateway(): void {
  void warmGatewayWhenReady();
}
