import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface CorrelationContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  callSid?: string;
  wsSessionId?: string;
  sessionId?: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

export function runWithCorrelation<T>(
  ctx: CorrelationContext,
  fn: () => T
): T {
  const parent = storage.getStore();
  return storage.run({ ...parent, ...ctx }, fn);
}

export function patchCorrelation(patch: CorrelationContext): void {
  const current = storage.getStore();
  if (!current) {
    storage.enterWith({ ...patch });
    return;
  }
  Object.assign(current, patch);
}

export function getCorrelation(): CorrelationContext {
  return { ...(storage.getStore() || {}) };
}

/** Flat fields for structured logs — soak window correlation grouping */
export function correlationLogFields(
  extra?: CorrelationContext
): Record<string, string | undefined> {
  const merged = { ...getCorrelation(), ...extra };
  const out: Record<string, string | undefined> = {};
  if (merged.requestId) out.requestId = merged.requestId;
  if (merged.tenantId) out.tenantId = merged.tenantId;
  if (merged.userId) out.userId = merged.userId;
  if (merged.callSid) out.callSid = merged.callSid;
  if (merged.wsSessionId) out.wsSessionId = merged.wsSessionId;
  if (merged.sessionId) out.sessionId = merged.sessionId;
  return out;
}

export function newWsSessionId(): string {
  return `ws_${randomUUID()}`;
}
