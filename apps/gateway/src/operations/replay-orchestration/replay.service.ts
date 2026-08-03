import { getPlatformEventBus, isP2EventBusEnabled } from '../../events/platform-event-bus.js';
import { collectStreamDiagnostics } from '../../events/event-metrics.js';
import { logger } from '../../services/logger.js';
import { recordEnterpriseAuditEvent } from '../../services/enterprise/enterprise-audit.service.js';

export interface ReplayStatus {
  enabled: boolean;
  dlqDepth: number;
  streams: Record<string, number>;
  replaySafe: boolean;
  advisory: string;
}

export async function getReplayStatus(): Promise<ReplayStatus> {
  const bus = getPlatformEventBus();
  if (!bus || !isP2EventBusEnabled()) {
    return {
      enabled: false,
      dlqDepth: 0,
      streams: {},
      replaySafe: true,
      advisory: 'Event bus disabled — no replay queue',
    };
  }
  const diag = await collectStreamDiagnostics(bus.getRedis());
  const dlqDepth = (diag as { dlqDepth?: number }).dlqDepth || 0;
  const streams = (diag as { streams?: Record<string, number> }).streams || {};
  return {
    enabled: true,
    dlqDepth,
    streams,
    replaySafe: true,
    advisory:
      dlqDepth > 0
        ? 'Consumers are idempotent — replay DLQ after fixing root cause'
        : 'No DLQ backlog',
  };
}

export async function requestDlqReplay(tenantId: string, actorId?: string): Promise<ReplayStatus> {
  const status = await getReplayStatus();
  logger.info('REPLAY_ORCHESTRATION_REQUESTED', { tenantId, dlqDepth: status.dlqDepth });
  await recordEnterpriseAuditEvent({
    tenantId,
    eventType: 'dlq_replay_requested',
    actorId,
    payload: { dlqDepth: status.dlqDepth },
  });
  return { ...status, advisory: 'Replay queued for operator confirmation — not auto-executed on live calls' };
}
