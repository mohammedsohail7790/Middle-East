/** Adaptive reconnect grace — pure heuristic, no Redis/session imports. */
export function computeAdaptiveReconnectGraceMs(avgReconnect: number): number {
  const base = Number(process.env.P1_RECONNECT_GRACE_MS || 15_000);
  if (avgReconnect <= 1) return base;
  if (avgReconnect <= 3) return Math.min(base * 1.5, 30_000);
  return Math.min(base * 2, 45_000);
}
