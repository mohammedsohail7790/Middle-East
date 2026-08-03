/** SSE connection flag — updated by DashboardRealtimeProvider, read by useDashboardSync. */

let streamConnected = false;
const listeners = new Set<(connected: boolean) => void>();

export function setDashboardStreamConnected(connected: boolean): void {
  if (streamConnected === connected) return;
  streamConnected = connected;
  listeners.forEach((fn) => {
    try {
      fn(connected);
    } catch {
      /* listener error must not break bus */
    }
  });
}

export function isDashboardStreamConnected(): boolean {
  return streamConnected;
}

export function subscribeDashboardStreamConnected(
  listener: (connected: boolean) => void
): () => void {
  listeners.add(listener);
  listener(streamConnected);
  return () => listeners.delete(listener);
}
