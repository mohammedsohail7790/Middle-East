/**
 * Call IQ Background Worker Process
 *
 * Runs independently of the API gateway to avoid competing for event-loop time
 * during active voice calls. Deploy as a separate Render service.
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { assertProductionSafety } from '@halla-ai/gateway/security/production-safety';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../apps/gateway/.env') });

assertProductionSafety();

process.stdout.write(
  JSON.stringify({
    level: 'info',
    msg: 'worker_bootstrap',
    env: process.env.NODE_ENV || 'development',
    pid: process.pid,
    ts: new Date().toISOString(),
  }) + '\n'
);

const { startRetentionWorker } = await import('@halla-ai/gateway/workers');

startRetentionWorker();

process.stdout.write(
  JSON.stringify({
    level: 'info',
    msg: 'worker_started',
    workers: ['retention'],
    ts: new Date().toISOString(),
  }) + '\n'
);

process.on('SIGTERM', () => {
  process.stdout.write(JSON.stringify({ level: 'info', msg: 'worker_shutdown', signal: 'SIGTERM', ts: new Date().toISOString() }) + '\n');
  process.exit(0);
});

process.on('SIGINT', () => {
  process.stdout.write(JSON.stringify({ level: 'info', msg: 'worker_shutdown', signal: 'SIGINT', ts: new Date().toISOString() }) + '\n');
  process.exit(0);
});
