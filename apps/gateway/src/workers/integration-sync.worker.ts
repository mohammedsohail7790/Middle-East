import { logger } from '../services/logger.js';
import { integrationSyncService } from '../services/integrations/integration-sync.service.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function startIntegrationSyncWorker(): void {
  if ((process.env.CALLIQ_INTEGRATION_SYNC_WORKER || 'true').toLowerCase() === 'false') {
    return;
  }

  const intervalMs = Number(process.env.CALLIQ_INTEGRATION_SYNC_INTERVAL_MS || 120_000);

  const run = async () => {
    try {
      await integrationSyncService.syncAllTenants();
      logger.info('INTEGRATION_SYNC_WORKER_COMPLETE');
    } catch (err) {
      logger.error('INTEGRATION_SYNC_WORKER_FAILED', { error: String(err) });
    }
  };

  const bootDelayMs = Number(process.env.CALLIQ_INTEGRATION_SYNC_BOOT_DELAY_MS || 20_000);
  setTimeout(() => void run(), bootDelayMs).unref?.();
  timer = setInterval(run, intervalMs);
  timer.unref?.();
  logger.info('INTEGRATION_SYNC_WORKER_STARTED', { intervalMs });
}

export function stopIntegrationSyncWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
