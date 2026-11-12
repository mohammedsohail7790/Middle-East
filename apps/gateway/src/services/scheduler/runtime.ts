import os from 'node:os';
import { logger } from '../logger.js';
import { pool } from '../db/pool.js';
import { PgJobStore } from './pg-job-store.js';
import { Scheduler } from './scheduler.js';
import { reminderHandler, reminderPlanner } from './reminder-jobs.js';
import { dialHandler } from './dial-jobs.js';
import { realDialPorts, realReminderPorts } from './ports.js';

export const jobStore = new PgJobStore(pool);

let timer: ReturnType<typeof setInterval> | null = null;
let scheduler: Scheduler | null = null;

/**
 * Starts polling the scheduled_jobs table. Safe to run in every gateway instance: jobs are claimed with FOR UPDATE SKIP LOCKED.
 * Set SCHEDULER_ENABLED=false to switch it off in an instance (for example a one-off script process).
 */
export function startScheduler(): void {
  if ((process.env.SCHEDULER_ENABLED || 'true').toLowerCase() === 'false' || timer) return;
  const tickMs = Number(process.env.SCHEDULER_TICK_MS || 10_000);
  scheduler = new Scheduler({
    store: jobStore,
    workerId: `${os.hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 6)}`,
    handlers: { appointment_reminder: reminderHandler(realReminderPorts), campaign_dial: dialHandler(realDialPorts) },
    planners: [reminderPlanner(jobStore, realReminderPorts)],
    log: (event, data) => (event.includes('FAILED') || event.includes('ABANDONED') ? logger.error(event, data) : logger.info(event, data)),
  });
  const run = () => void scheduler!.tick().catch((err) => logger.error('SCHEDULER_TICK_FAILED', { error: String(err) }));
  setTimeout(run, 5_000).unref?.();
  timer = setInterval(run, tickMs);
  timer.unref?.();
  logger.info('SCHEDULER_STARTED', { tickMs });
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  scheduler = null;
}
