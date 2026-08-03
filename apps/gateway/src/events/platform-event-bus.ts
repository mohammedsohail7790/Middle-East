import { createRedisClient } from '../services/redis-connection.js';
import { RedisPlatformEventBus } from '../../../../infrastructure/events/event-bus.js';
import { logEventTelemetry } from './event-observability.js';
import { registerPlatformConsumers } from './consumers/index.js';

let bus: RedisPlatformEventBus | null = null;
let started = false;

export function isP2EventBusEnabled(): boolean {
  return process.env.CALLIQ_P2_EVENT_BUS !== 'false' && Boolean(process.env.REDIS_URL);
}

export function isP2AsyncIntegrationsEnabled(): boolean {
  return process.env.CALLIQ_P2_ASYNC_INTEGRATIONS === 'true';
}

export function getPlatformEventBus(): RedisPlatformEventBus | null {
  if (!isP2EventBusEnabled()) return null;
  if (!bus) {
    bus = new RedisPlatformEventBus({
      redis: createRedisClient(undefined, { label: 'platform-events' }),
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

export function stopPlatformEventBus(): void {
  bus?.stop();
  started = false;
}

export function getEventBusMetrics() {
  return getPlatformEventBus()?.getMetrics() ?? null;
}

/** @deprecated Use getPlatformEventBus + publishPlatformEvent */
export { PlatformEventTypes as PlatformEvents } from '../../../../infrastructure/events/event-types.js';
