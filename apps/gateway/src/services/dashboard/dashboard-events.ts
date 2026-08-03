import { voiceRedis } from '../voice/redis.client.js';
import { logger } from '../logger.js';

/** Redis pub/sub channel per tenant — consumed by dashboard SSE connections */
export function dashboardPushChannel(tenantId: string): string {
  return `dashboard:push:${tenantId}`;
}

export type DashboardPushType =
  | 'call.started'
  | 'call.ended'
  | 'call.updated'
  | 'sms.inbound'
  | 'sms.outbound'
  | 'lead.created'
  | 'lead.updated'
  | 'calendar.updated'
  | 'billing.updated'
  | 'knowledge.updated'
  | 'config.updated'
  | 'phone.updated'
  | 'integrations.updated'
  | 'team.updated';

export interface DashboardPushPayload {
  type: DashboardPushType;
  /** Dashboard sync scopes (calls, sms, billing, …) */
  scopes: string[];
  at: string;
  meta?: Record<string, unknown>;
}

/**
 * Push an instant dashboard refresh signal (works without the P2 platform event bus).
 * Fire-and-forget — never throws to callers.
 */
export function publishDashboardPush(
  tenantId: string,
  payload: Omit<DashboardPushPayload, 'at'> & { at?: string }
): void {
  if (!tenantId) return;
  const message: DashboardPushPayload = {
    ...payload,
    at: payload.at ?? new Date().toISOString(),
  };
  void voiceRedis
    .publish(dashboardPushChannel(tenantId), JSON.stringify(message))
    .catch((err) => {
      logger.warn('DASHBOARD_PUSH_FAILED', {
        tenantId,
        type: payload.type,
        error: String(err),
      });
    });
}

export function scopesForPushType(type: DashboardPushType): string[] {
  switch (type) {
    case 'call.started':
      return ['calls', 'metrics', 'analytics'];
    case 'call.ended':
    case 'call.updated':
      return ['calls', 'metrics', 'analytics', 'calendar', 'leads'];
    case 'sms.inbound':
    case 'sms.outbound':
      return ['sms', 'calls'];
    case 'lead.created':
    case 'lead.updated':
      return ['leads', 'metrics', 'analytics'];
    case 'calendar.updated':
      return ['calendar', 'calls', 'leads', 'metrics', 'analytics'];
    case 'billing.updated':
      return ['billing', 'metrics', 'phone', 'integrations'];
    case 'knowledge.updated':
      return ['knowledge', 'config'];
    case 'config.updated':
      return ['config', 'settings', 'knowledge'];
    case 'phone.updated':
      return ['phone', 'config', 'settings', 'billing'];
    case 'integrations.updated':
      return ['integrations', 'settings'];
    case 'team.updated':
      return ['settings', 'team'];
    default:
      return ['metrics'];
  }
}

export function publishDashboardPushType(
  tenantId: string,
  type: DashboardPushType,
  extraScopes: string[] = [],
  meta?: Record<string, unknown>
): void {
  const scopes = [...new Set([...scopesForPushType(type), ...extraScopes])];
  publishDashboardPush(tenantId, { type, scopes, meta });
}
