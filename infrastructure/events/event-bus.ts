import type { Redis } from 'ioredis';
import {
  createPlatformEvent,
  type PlatformEvent,
  type PublishContext,
} from './event-envelope.js';
import type { PlatformEventType } from './event-types.js';
import { allPlatformStreams } from './event-router.js';
import { publishToStream } from './event-publisher.js';
import {
  ensureConsumerGroups,
  readAndProcessBatch,
  type EventHandler,
} from './event-consumer.js';

export interface PlatformEventBusOptions {
  redis: Redis;
  enabled?: boolean;
  consumersEnabled?: boolean;
}

export class RedisPlatformEventBus {
  private readonly redis: Redis;
  private readonly enabled: boolean;
  private readonly consumersEnabled: boolean;
  private consumerTimer: ReturnType<typeof setInterval> | null = null;
  private handlers: Array<{ streams: string[]; name: string; handler: EventHandler }> = [];
  private metrics = {
    published: 0,
    consumed: 0,
    retries: 0,
    dlq: 0,
    publishFailures: 0,
  };

  constructor(opts: PlatformEventBusOptions) {
    this.redis = opts.redis;
    this.enabled = opts.enabled !== false;
    this.consumersEnabled = opts.consumersEnabled !== false;
  }

  onTelemetry?: (
    kind: 'EVENT_PUBLISHED' | 'EVENT_CONSUMED' | 'EVENT_RETRY' | 'EVENT_DLQ',
    fields: Record<string, string | number | boolean | undefined>
  ) => void;

  registerConsumer(
    name: string,
    streams: string[],
    handler: EventHandler
  ): void {
    this.handlers.push({ name, streams, handler });
  }

  async start(): Promise<void> {
    if (!this.enabled) return;
    const streams = allPlatformStreams();
    await ensureConsumerGroups(this.redis, streams);
    if (!this.consumersEnabled || this.handlers.length === 0) return;

    const tick = async () => {
      for (const reg of this.handlers) {
        try {
          const n = await readAndProcessBatch(
            {
              redis: this.redis,
              streams: reg.streams,
              consumerName: `${reg.name}-${process.pid}`,
              onTelemetry: (kind, fields) => {
                if (kind === 'EVENT_CONSUMED') this.metrics.consumed++;
                if (kind === 'EVENT_RETRY') this.metrics.retries++;
                if (kind === 'EVENT_DLQ') this.metrics.dlq++;
                this.onTelemetry?.(kind, { ...fields, consumer: reg.name });
              },
            },
            reg.handler
          );
          if (n > 0) this.metrics.consumed += 0;
        } catch {
          /* isolated consumer loop fault */
        }
      }
    };

    this.consumerTimer = setInterval(() => {
      tick().catch(() => {});
    }, Number(process.env.P2_CONSUMER_POLL_MS || 1000));
    this.consumerTimer.unref?.();
    await tick();
  }

  stop(): void {
    if (this.consumerTimer) clearInterval(this.consumerTimer);
    this.consumerTimer = null;
  }

  getMetrics(): typeof this.metrics & { handlers: number } {
    return { ...this.metrics, handlers: this.handlers.length };
  }

  getRedis(): Redis {
    return this.redis;
  }

  async publish<T extends Record<string, unknown>>(
    eventType: PlatformEventType,
    payload: T,
    ctx: PublishContext
  ): Promise<PlatformEvent<T> | null> {
    if (!this.enabled) return null;

    const event = createPlatformEvent(eventType, payload, ctx);
    try {
      const streamId = await publishToStream(this.redis, event);
      this.metrics.published++;
      this.onTelemetry?.('EVENT_PUBLISHED', {
        eventId: event.eventId,
        eventType: event.eventType,
        tenantId: event.tenantId,
        callSid: event.callSid,
        correlationId: event.correlationId,
        streamId: streamId || undefined,
      });
      return event;
    } catch {
      this.metrics.publishFailures++;
      return null;
    }
  }

  /** Fire-and-forget — never throws to caller (failure containment). */
  emit<T extends Record<string, unknown>>(
    eventType: PlatformEventType,
    payload: T,
    ctx: PublishContext
  ): void {
    this.publish(eventType, payload, ctx).catch(() => {});
  }
}
