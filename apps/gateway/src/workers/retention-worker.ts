import { logger } from '../services/logger.js';
import { dataRetentionService } from '../services/data-retention/retention.service.js';
let timer: ReturnType<typeof setInterval> | null = null;

export function startRetentionWorker(): void {
  if ((process.env.CALLIQ_RETENTION_WORKER || 'true').toLowerCase() === 'false') return;
  const intervalMs = Number(process.env.CALLIQ_RETENTION_INTERVAL_MS || 3_600_000);

  const run = async () => {
    try {
      const result = await dataRetentionService.executeCleanup();
      logger.info('RETENTION_WORKER_COMPLETE', { result });
      // Per-tenant audit entries are written by cleanup_retention_data() where applicable
    } catch (err) {
      logger.error('RETENTION_WORKER_FAILED', { error: String(err) });
    }
  };

  const bootDelayMs = Number(process.env.CALLIQ_RETENTION_BOOT_DELAY_MS || 30_000);
  setTimeout(() => void run(), bootDelayMs).unref?.();
  timer = setInterval(run, intervalMs);
  timer.unref?.();
  logger.info('RETENTION_WORKER_STARTED', { intervalMs });
}

export function stopRetentionWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
