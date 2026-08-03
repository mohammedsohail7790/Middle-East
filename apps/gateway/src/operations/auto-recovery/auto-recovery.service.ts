import { logger } from '../../services/logger.js';
import { evaluateAnomalies } from '../../observability/anomaly-detection/anomaly-detector.js';
import { getPlatformEventBus, isP2EventBusEnabled } from '../../events/platform-event-bus.js';
import { collectStreamDiagnostics } from '../../events/event-metrics.js';

export interface RecoveryAction {
  id: string;
  action: string;
  status: 'suggested' | 'applied' | 'skipped';
  detail: string;
}

/** Safe recovery suggestions — never terminates live inbound calls. */
export async function evaluateAutoRecovery(tenantId?: string): Promise<RecoveryAction[]> {
  const actions: RecoveryAction[] = [];
  const anomalies = await evaluateAnomalies(tenantId);

  for (const a of anomalies) {
    if (a.id === 'dlq_growth') {
      actions.push({
        id: 'dlq_inspect',
        action: 'inspect_dlq',
        status: 'suggested',
        detail: 'Review DLQ entries and replay after consumer fix',
      });
    }
    if (a.id === 'reconnect_spike') {
      actions.push({
        id: 'reconnect_advisory',
        action: 'advisory_reconnect',
        status: 'suggested',
        detail: 'Verify client backoff; P1 reconnect grace remains authoritative',
      });
    }
    if (a.id === 'memory_pressure') {
      actions.push({
        id: 'heap_gc_hint',
        action: 'schedule_restart_window',
        status: 'suggested',
        detail: 'Plan rolling gateway restart during low-traffic window',
      });
    }
  }

  return actions;
}

export async function runAutoRecoveryCycle(): Promise<{ actions: RecoveryAction[] }> {
  const actions = await evaluateAutoRecovery();
  const bus = getPlatformEventBus();
  if (bus && isP2EventBusEnabled()) {
    const diag = await collectStreamDiagnostics(bus.getRedis());
    const dlq = (diag as { dlqDepth?: number }).dlqDepth || 0;
    if (dlq > 100) {
      logger.warn('AUTO_RECOVERY_DLQ_THRESHOLD', { dlqDepth: dlq });
      logger.info('AUTO_RECOVERY_DLQ_ADVISORY', { dlqDepth: dlq, actionCount: actions.length });
    }
  }
  return { actions };
}
