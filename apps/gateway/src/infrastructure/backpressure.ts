import { sessionRegistry } from '../services/realtime/session-registry.js';

export interface BackpressureState {
  level: 'normal' | 'elevated' | 'critical';
  activeSessions: number;
  shouldThrottleEvents: boolean;
  shouldDeferNonCriticalAi: boolean;
}

/** Lightweight backpressure — never drops inbound calls. */
export function evaluateBackpressure(): BackpressureState {
  const active = sessionRegistry.listActive().length;
  const reconnecting = sessionRegistry.listActive().filter((s) => s.state === 'reconnecting').length;
  const ratio = active > 0 ? reconnecting / active : 0;

  let level: BackpressureState['level'] = 'normal';
  if (active > Number(process.env.CALLIQ_BACKPRESSURE_SESSIONS || 200) || ratio > 0.35) {
    level = 'elevated';
  }
  if (active > Number(process.env.CALLIQ_BACKPRESSURE_CRITICAL || 400) || ratio > 0.5) {
    level = 'critical';
  }

  return {
    level,
    activeSessions: active,
    shouldThrottleEvents: level !== 'normal',
    shouldDeferNonCriticalAi: level === 'critical',
  };
}
