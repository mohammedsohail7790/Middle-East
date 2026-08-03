/**
 * P1-A idempotency guards — transport generations, tool keys, reconnect sequences.
 */
const toolKeys = new Map<string, number>();
const attachKeys = new Set<string>();

export function nextTransportGeneration(sessionId: string, current: number): number {
  return current + 1;
}

export function transportAttachKey(
  sessionId: string,
  wsSessionId: string,
  generation: number
): string {
  return `${sessionId}:${wsSessionId}:${generation}`;
}

/** Returns false if this exact transport attach was already applied. */
export function markTransportAttachOnce(key: string): boolean {
  if (attachKeys.has(key)) return false;
  attachKeys.add(key);
  if (attachKeys.size > 50_000) {
    const drop = [...attachKeys].slice(0, 10_000);
    for (const k of drop) attachKeys.delete(k);
  }
  return true;
}

export function clearTransportAttachKeysForSession(sessionId: string): void {
  for (const k of attachKeys) {
    if (k.startsWith(`${sessionId}:`)) attachKeys.delete(k);
  }
}

/** Tool execution dedupe within a runtime session window. */
export function shouldExecuteTool(
  sessionId: string,
  toolName: string,
  idempotencyKey?: string
): boolean {
  const key = idempotencyKey || `${sessionId}:${toolName}`;
  const now = Date.now();
  const prev = toolKeys.get(key);
  if (prev && now - prev < 30_000) return false;
  toolKeys.set(key, now);
  if (toolKeys.size > 20_000) {
    const cutoff = now - 60_000;
    for (const [k, t] of toolKeys) {
      if (t < cutoff) toolKeys.delete(k);
    }
  }
  return true;
}

export function reconnectSequenceId(callSid: string, reconnectCount: number): string {
  return `${callSid}:r${reconnectCount}`;
}
