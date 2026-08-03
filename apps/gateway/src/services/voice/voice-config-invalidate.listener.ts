import { voiceRedis } from './redis.client.js';
import { logger } from '../logger.js';

export const VOICE_TENANT_INVALIDATE_CHANNEL = 'voice:tenant:invalidate';

type InvalidateHandler = (tenantId: string, rev: string) => void | Promise<void>;

let started = false;

/** Subscribe once per process — reload in-flight voice sessions when tenant config changes. */
export function startVoiceConfigInvalidateListener(onInvalidate: InvalidateHandler): void {
  if (started) return;
  started = true;

  const sub = voiceRedis.duplicate();
  sub.on('error', (err) => {
    logger.warn('VOICE_INVALIDATE_SUB_ERROR', { error: String(err) });
  });

  void sub
    .subscribe(VOICE_TENANT_INVALIDATE_CHANNEL)
    .then(() => {
      logger.info('VOICE_INVALIDATE_SUBSCRIBER_READY');
    })
    .catch((err) => {
      logger.warn('VOICE_INVALIDATE_SUBSCRIBE_FAILED', { error: String(err) });
    });

  sub.on('message', (_channel, raw) => {
    try {
      const payload = JSON.parse(raw) as { tenantId?: string; rev?: string };
      const tenantId = payload.tenantId?.trim();
      if (!tenantId) return;
      void Promise.resolve(onInvalidate(tenantId, payload.rev || '')).catch((err) => {
        logger.warn('VOICE_INVALIDATE_HANDLER_FAILED', { tenantId, error: String(err) });
      });
    } catch {
      /* ignore malformed */
    }
  });
}
