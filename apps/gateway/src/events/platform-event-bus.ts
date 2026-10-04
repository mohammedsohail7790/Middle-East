import { createRedisClient } from '../services/redis-connection.js';
import { RedisPlatformEventBus } from '../../../../infrastructure/events/event-bus.js';
import { logEventTelemetry } from './event-observability.js';
import { registerPlatformConsumers } from './consumers/index.js';

let bus: RedisPlatformEventBus | null = null;
let started = false;
let closed = false;

export function isP2EventBusEnabled(): boolean {
  return process.env.CALLIQ_P2_EVENT_BUS !== 'false' && Boolean(process.env.REDIS_URL);
}

export function isP2AsyncIntegrationsEnabled(): boolean {
  return process.env.CALLIQ_P2_ASYNC_INTEGRATIONS === 'true';
}

export function getPlatformEventBus(): RedisPlatformEventBus | null {
  if (!isP2EventBusEnabled() || closed) return null;
  if (!bus) {
    bus = new RedisPlatformEventBus({
      // Two connections from the same factory/REDIS_URL: the consumer one parks in blocking XREADGROUP reads, so
      // publishing and diagnostics must use their own non-blocking connection (see RedisPlatformEventBus).
      redis: createRedisClient(undefined, { label: 'platform-events' }),
      publisherRedis: createRedisClient(undefined, { label: 'platform-events-publisher' }),
      enabled: true,
      consumersEnabled: process.env.CALLIQ_P2_CONSUMERS !== 'false',
    });
    bus.onTelemetry = (kind, fields) => logEventTelemetry(kind, fields);
    registerPlatformConsumers(bus);
  }
  return bus;
}

export async function startPlatformEventBus(): Promise<void> {
  if (started) return;
  const instance = getPlatformEventBus();
  if (!instance) return;
  await instance.start();
  started = true;
}

/** Graceful shutdown: stops polling and closes both Redis connections. The bus stays closed afterwards. */
export async function stopPlatformEventBus(): Promise<void> {
  const current = bus;
  closed = true;
  started = false;
  bus = null;
  await current?.shutdown();
}

export function getEventBusMetrics() {
  return getPlatformEventBus()?.getMetrics() ?? null;
}

/** @deprecated Use getPlatformEventBus + publishPlatformEvent */
export { PlatformEventTypes as PlatformEvents } from '../../../../infrastructure/events/event-types.js';
