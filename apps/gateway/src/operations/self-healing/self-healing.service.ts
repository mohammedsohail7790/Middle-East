import { sessionWatchdog } from '../../services/realtime/session-watchdog.js';
import { runAutoRecoveryCycle } from '../auto-recovery/auto-recovery.service.js';
import { routeOperationalAlerts } from '../alert-routing/alert-router.service.js';
import { logger } from '../../services/logger.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function startSelfHealingLoop(): void {
  if ((process.env.CALLIQ_SELF_HEALING || 'true').toLowerCase() === 'false') return;
  const intervalMs = Number(process.env.CALLIQ_SELF_HEALING_INTERVAL_MS || 120_000);

  const tick = async () => {
    try {
      sessionWatchdog.getMetrics();
      const recovery = await runAutoRecoveryCycle();
      await routeOperationalAlerts();
      if (recovery.actions.length) {
        logger.info('SELF_HEALING_CYCLE', { actions: recovery.actions.length });
      }
    } catch (err) {
      logger.error('SELF_HEALING_CYCLE_FAILED', { error: String(err) });
    }
  };

  void tick();
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  logger.info('SELF_HEALING_STARTED', { intervalMs });
}

export function stopSelfHealingLoop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
