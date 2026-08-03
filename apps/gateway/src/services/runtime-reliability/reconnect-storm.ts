import { sessionRegistry } from '../realtime/session-registry.js';

export interface ReconnectStormReport {
  isStorm: boolean;
  reconnectingCount: number;
  highChurnSessions: number;
  overlapRisk: 'low' | 'medium' | 'high';
  confidence: number;
}

/** Classify reconnect storms without changing P1 session authority. */
export function detectReconnectStorm(tenantId?: string): ReconnectStormReport {
  const sessions = sessionRegistry
    .listActive()
    .filter((s) => !tenantId || s.tenantId === tenantId);

  const reconnecting = sessions.filter((s) => s.state === 'reconnecting').length;
  const highChurn = sessions.filter((s) => s.metrics.reconnectCount >= 4).length;
  const ratio = sessions.length > 0 ? reconnecting / sessions.length : 0;

  const isStorm = reconnecting >= 5 || (ratio > 0.4 && sessions.length >= 3);
  const overlapRisk =
    highChurn >= 3 ? 'high' : reconnecting >= 2 ? 'medium' : 'low';

  return {
    isStorm,
    reconnectingCount: reconnecting,
    highChurnSessions: highChurn,
    overlapRisk,
    confidence: Math.min(0.98, 0.5 + ratio * 0.5 + (highChurn > 0 ? 0.15 : 0)),
  };
}
