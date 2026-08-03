import { voiceRedis } from '../voice/redis.client.js';
import { logger } from '../logger.js';

export const AI_CONFIG_PUSH_CHANNEL = 'ai-config:push';

export interface AiConfigPushMessage {
  tenantId: string;
  config: unknown;
  at: string;
}

/** Fan config updates to all gateway instances via Redis pub/sub. */
export function publishAiConfigUpdate(tenantId: string, config: unknown): void {
  if (!tenantId) return;
  const message: AiConfigPushMessage = {
    tenantId,
    config,
    at: new Date().toISOString(),
  };
  void voiceRedis
    .publish(AI_CONFIG_PUSH_CHANNEL, JSON.stringify(message))
    .catch((err) => {
      logger.warn('AI_CONFIG_PUSH_PUBLISH_FAILED', { tenantId, error: String(err) });
    });
}
