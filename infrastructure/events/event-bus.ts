import type { Redis } from 'ioredis';
import {
  createPlatformEvent,
  type PlatformEvent,
  type PublishContext,
} from './event-envelope.js';
import type { PlatformEventType } from './event-types.js';
import { allPlatformStreams, routeEventToStream } from './event-router.js';
import { publishToStream } from './event-publisher.js';
import {
  ensureConsumerGroups,
  readAndProcessBatch,
  type EventHandler,
} from './event-consumer.js';

/** Minimum gap between repeated CONSUMER_LOOP_ERROR logs for the same consumer. */
const LOOP_ERROR_LOG_INTERVAL_MS = 30_000;

/** Error text safe to log: bounded length, and any Redis URL (which may carry a password) removed. */
function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return raw.replace(/rediss?:\/\/\S+/gi, '<redis-url>').slice(0, 200);
}

export interface PlatformEventBusOptions {
  /** Consumer connection: used for the blocking XREADGROUP polls (and the XGROUP/XACK/XCLAIM bookkeeping around them). */
  redis: Redis;
  /**
   * Dedicated NON-blocking connection for XADD publishing and diagnostics (XLEN). A Redis connection serves one
   * command at a time, so a publish issued on the connection that is parked in a blocking XREADGROUP waits for
   * that read — and for every read queued behind it. Falls back to `redis` when omitted (legacy single-client
   * setup, which has that starvation problem).
   */
  publisherRedis?: Redis;
  enabled?: boolean;
  consumersEnabled?: boolean;
}

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** ioredis reaches status 'end' a moment AFTER QUIT/disconnect returns; wait for it (bounded) so callers see a closed client. */
async function waitUntilClosed(client: Redis, timeoutMs: number): Promise<void> {
  if (typeof client.once !== 'function' || client.status === 'end') return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    client.once('end', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export class RedisPlatformEventBus {
  private readonly redis: Redis;
  private readonly publisher: Redis;
  private readonly enabled: boolean;
  private readonly consumersEnabled: boolean;
  private consumerTimer: ReturnType<typeof setInterval> | null = null;
  private tickInFlight: Promise<void> | null = null;
  private stopping = false;
  private handlers: Array<{ streams: string[]; name: string; handler: EventHandler; groupName?: string; maxRetries?: number }> = [];
  private metrics = {
    published: 0,
    consumed: 0,
    retries: 0,
    dlq: 0,
    publishFailures: 0,
  };

  constructor(opts: PlatformEventBusOptions) {
    this.redis = opts.redis;
    this.publisher = opts.publisherRedis ?? opts.redis;
    this.enabled = opts.enabled !== false;
    this.consumersEnabled = opts.consumersEnabled !== false;
  }

  onTelemetry?: (
    kind:
      | 'EVENT_PUBLISHED'
      | 'EVENT_CONSUMED'
      | 'EVENT_RETRY'
      | 'EVENT_DLQ'
      | 'EVENT_PUBLISH_FAILED'
      | 'EVENT_UNDECODABLE'
      | 'CONSUMER_LOOP_ERROR',
    fields: Record<string, string | number | boolean | undefined>
  ) => void;

  private lastLoopErrorLogAt = new Map<string, number>();

  /**
   * `groupName` defaults to the shared platform group. Pass a distinct
   * group when a consumer must see every event on a stream independently
   * of the stream's existing handler(s) — Redis Streams consumer groups
   * distribute each message to exactly one consumer *within* a group, so
   * two handlers reading the same stream in the same group would compete
   * for messages rather than both receiving them.
   */
  registerConsumer(
    name: string,
    streams: string[],
    handler: EventHandler,
    opts?: { groupName?: string; maxRetries?: number }
  ): void {
    this.handlers.push({ name, streams, handler, groupName: opts?.groupName, maxRetries: opts?.maxRetries });
  }

  async start(): Promise<void> {
    if (!this.enabled) return;
    this.stopping = false;
    const streams = allPlatformStreams();
    await ensureConsumerGroups(this.redis, streams);
    const customGroups = new Set(this.handlers.map((h) => h.groupName).filter((g): g is string => Boolean(g)));
    for (const groupName of customGroups) {
      await ensureConsumerGroups(this.redis, streams, groupName);
    }
    if (!this.consumersEnabled || this.handlers.length === 0) return;

    const tick = async () => {
      for (const reg of this.handlers) {
        if (this.stopping) return; // shutdown requested: do not start another blocking read
        try {
          const n = await readAndProcessBatch(
            {
              redis: this.redis,
              streams: reg.streams,
              groupName: reg.groupName,
              maxRetries: reg.maxRetries,
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
        } catch (err) {
          // Isolated consumer loop fault: never thrown to the caller, but no longer invisible.
          // Rate-limited so a sustained Redis outage logs once per interval per consumer.
          const now = Date.now();
          if (now - (this.lastLoopErrorLogAt.get(reg.name) ?? 0) >= LOOP_ERROR_LOG_INTERVAL_MS) {
            this.lastLoopErrorLogAt.set(reg.name, now);
            this.onTelemetry?.('CONSUMER_LOOP_ERROR', {
              consumer: reg.name,
              group: reg.groupName,
              error: safeErrorMessage(err),
            });
          }
        }
      }
    };

    this.consumerTimer = setInterval(() => {
      this.runTick(tick).catch(() => {});
    }, Number(process.env.P2_CONSUMER_POLL_MS || 1000));
    this.consumerTimer.unref?.();
    await this.runTick(tick);
  }

  /**
   * One tick at a time. A tick walks every handler and each idle handler parks in a blocking read for up to
   * BLOCK ms, so a tick routinely outlasts the 1 s interval; starting a new tick on every interval stacked
   * an ever-growing queue of blocking reads on the connection (the same starvation that hit the publisher).
   * While a tick is running, interval fires simply join it instead of starting another.
   */
  private runTick(tick: () => Promise<void>): Promise<void> {
    if (this.tickInFlight) return this.tickInFlight;
    const run: Promise<void> = tick().finally(() => {
      if (this.tickInFlight === run) this.tickInFlight = null;
    });
    this.tickInFlight = run;
    return run;
  }

  stop(): void {
    this.stopping = true;
    if (this.consumerTimer) clearInterval(this.consumerTimer);
    this.consumerTimer = null;
  }

  /**
   * Graceful shutdown: stop polling, let the in-flight tick finish (bounded by timeoutMs), then close BOTH
   * connections. QUIT is queued behind a blocked read, so each client is hard-disconnected if it does not
   * close within the timeout.
   */
  async shutdown(timeoutMs = 5000): Promise<void> {
    this.stop();
    const inFlight = this.tickInFlight;
    if (inFlight) await Promise.race([inFlight.catch(() => {}), sleepMs(timeoutMs)]);

    const clients = new Set<Redis>([this.redis, this.publisher]);
    await Promise.all(
      [...clients].map(async (client) => {
        try {
          if (typeof client.quit === 'function') await Promise.race([client.quit(), sleepMs(timeoutMs)]);
        } catch {
          /* already closed or failing — fall through to the hard disconnect */
        } finally {
          client.disconnect?.();
        }
        await waitUntilClosed(client, timeoutMs);
      })
    );
  }

  getMetrics(): typeof this.metrics & { handlers: number } {
    return { ...this.metrics, handlers: this.handlers.length };
  }

  /** Non-blocking connection (publishing, XLEN diagnostics). Safe for callers that must not wait on a blocking read. */
  getRedis(): Redis {
    return this.publisher;
  }

  /** The consumer connection that carries the blocking XREADGROUP polls. */
  getConsumerRedis(): Redis {
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
      const streamId = await publishToStream(this.publisher, event);
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
    } catch (err) {
      this.metrics.publishFailures++;
      this.onTelemetry?.('EVENT_PUBLISH_FAILED', {
        eventId: event.eventId,
        eventType: event.eventType,
        tenantId: event.tenantId,
        stream: routeEventToStream(event.eventType),
        error: safeErrorMessage(err),
      });
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
