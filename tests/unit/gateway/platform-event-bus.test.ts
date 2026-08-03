import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPlatformEvent } from '../../../infrastructure/events/event-envelope.js';
import { PlatformEventTypes } from '../../../infrastructure/events/event-types.js';
import { routeEventToStream } from '../../../infrastructure/events/event-router.js';
import { encodeEventEnvelope, decodeEventEnvelope } from '../../../infrastructure/events/event-codecs.js';

vi.mock('ioredis', () => {
  const handlers: Record<string, Function> = {};
  const store = new Map<string, string[][]>();

  class RedisMock {
    async xadd(stream: string, ...args: string[]) {
      const entries = store.get(stream) || [];
      const id = `${Date.now()}-0`;
      const fields: string[] = [];
      const start = args.indexOf('*') + 1;
      for (let i = start; i < args.length; i += 2) fields.push(args[i], args[i + 1]);
      entries.push([id, fields]);
      store.set(stream, entries);
      return id;
    }
    async xgroup() {
      return 'OK';
    }
    async xreadgroup() {
      return null;
    }
    async set(key: string, val: string, _ex: string, _ttl: number, nx?: string) {
      if (nx === 'NX' && handlers[key]) return null;
      handlers[key] = () => val;
      return 'OK';
    }
    async get(key: string) {
      return handlers[key] ? handlers[key]() : null;
    }
    async del(key: string) {
      delete handlers[key];
    }
    async incr(key: string) {
      const v = Number(handlers[key]?.() || 0) + 1;
      handlers[key] = () => String(v);
      return v;
    }
    async expire() {
      return 1;
    }
    async xack() {
      return 1;
    }
    async xlen(stream: string) {
      return store.get(stream)?.length || 0;
    }
  }
  return { default: RedisMock };
});

describe('P2 event envelope', () => {
  it('round-trips codec', () => {
    const event = createPlatformEvent(
      PlatformEventTypes.APPOINTMENT_CREATED,
      { appointmentId: 'a1' },
      { tenantId: 't1', callSid: 'CA1' }
    );
    const flat = encodeEventEnvelope(event);
    const decoded = decodeEventEnvelope(Object.entries(flat).flat() as string[]);
    expect(decoded?.eventId).toBe(event.eventId);
    expect(decoded?.eventType).toBe(PlatformEventTypes.APPOINTMENT_CREATED);
  });

  it('routes appointment events to appointment stream', () => {
    expect(routeEventToStream(PlatformEventTypes.APPOINTMENT_CREATED)).toBe(
      'calliq:stream:appointment-events'
    );
    expect(routeEventToStream(PlatformEventTypes.CRM_SYNC_REQUESTED)).toBe(
      'calliq:stream:integration-events'
    );
  });
});

describe('P2 RedisPlatformEventBus', () => {
  beforeEach(() => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  });

  it('publishes without throwing', async () => {
    const { RedisPlatformEventBus } = await import(
      '../../../infrastructure/events/event-bus.js'
    );
    const { default: Redis } = await import('ioredis');
    const bus = new RedisPlatformEventBus({ redis: new Redis() as any, consumersEnabled: false });
    const event = await bus.publish(
      PlatformEventTypes.LEAD_CREATED,
      { phone: '+1' },
      { tenantId: 'tenant-1', callSid: 'CA99' }
    );
    expect(event?.eventType).toBe(PlatformEventTypes.LEAD_CREATED);
    bus.stop();
  });
});
