import { CacheManager } from '../cache.js';
import { voiceRedis } from './redis.client.js';
import { logger } from '../logger.js';
import { VOICE_TENANT_INVALIDATE_CHANNEL } from './voice-config-invalidate.listener.js';

const cache = new CacheManager();

/** Bump revision so the next call bypasses stale in-memory cache */
export async function invalidateVoiceTenantCache(tenantId: string): Promise<void> {
  const rev = Date.now().toString();
  await Promise.all([
    cache.del(`voice:tenant:${tenantId}`),
    voiceRedis.setex(`voice:tenant:rev:${tenantId}`, 86400, rev),
    voiceRedis.publish(
      VOICE_TENANT_INVALIDATE_CHANNEL,
      JSON.stringify({ tenantId, rev, at: new Date().toISOString() })
    ).catch(() => {}),
  ]);
  logger.info('VOICE_TENANT_CACHE_INVALIDATED', { tenantId, rev });
}

export async function getVoiceTenantConfigRevision(tenantId: string): Promise<string> {
  return (await voiceRedis.get(`voice:tenant:rev:${tenantId}`)) || '0';
}
