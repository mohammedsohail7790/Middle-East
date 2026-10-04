/**
 * Failures that used to vanish silently must now surface through the bus telemetry callback
 * (which the gateway logs as warnings) — without changing behaviour (still never thrown to the caller,
 * still acked / still returns null) and without leaking Redis URLs or payloads.
 */
import { describe, it, expect } from 'vitest';
import { FakeRedisStreams } from '../helpers/fake-redis-streams.js';
import { RedisPlatformEventBus } from '../../infrastructure/events/event-bus.js';
import { ensureConsumerGroups, readAndProcessBatch } from '../../infrastructure/events/event-consumer.js';

type Seen = Array<{ kind: string; fields: Record<string, unknown> }>;

describe('event bus failure visibility', () => {
  it('a failed publish is reported (ids, type, stream, safe error) and still returns null without throwing', async () => {
    const redis = new FakeRedisStreams();
    redis.xadd = async () => {
      throw new Error('connect ECONNREFUSED redis://default:s3cr3t-pw@10.0.0.9:6379 while writing');
    };
    const bus = new RedisPlatformEventBus({ redis: redis as any });
    const seen: Seen = [];
    bus.onTelemetry = (kind, fields) => seen.push({ kind, fields });

    const result = await bus.publish('LEAD_CREATED' as any, { phone: '+12025550101', name: 'Secret Name' }, { tenantId: 'tenant-1' });

    expect(result).toBeNull();
    expect(bus.getMetrics().publishFailures).toBe(1);
    const failure = seen.find((s) => s.kind === 'EVENT_PUBLISH_FAILED');
    expect(failure).toBeTruthy();
    expect(failure!.fields).toMatchObject({ eventType: 'LEAD_CREATED', tenantId: 'tenant-1', stream: 'calliq:stream:lead-events' });
    expect(typeof failure!.fields.eventId).toBe('string');
    const logged = JSON.stringify(failure!.fields);
    expect(logged).not.toContain('s3cr3t-pw'); // Redis URL (with password) is stripped from the error text
    expect(logged).not.toContain('+12025550101'); // no payload / PII
    expect(logged).not.toContain('Secret Name');
  });

  it('an undecodable stream entry is reported by identifiers only, and is still acked (behaviour unchanged)', async () => {
    const redis = new FakeRedisStreams();
    const stream = 'test:undecodable';
    const group = 'g-undecodable';
    await ensureConsumerGroups(redis as any, [stream], group);
    await redis.xadd(stream, '*', 'garbage', 'no-envelope-field');
    const seen: Seen = [];

    await readAndProcessBatch(
      {
        redis: redis as any,
        streams: [stream],
        groupName: group,
        consumerName: 'c1',
        blockMs: 0,
        reclaimIntervalMs: 0,
        onTelemetry: (kind, fields) => seen.push({ kind, fields }),
      },
      async () => {
        throw new Error('handler must not run for an undecodable entry');
      }
    );

    const entry = seen.find((s) => s.kind === 'EVENT_UNDECODABLE');
    expect(entry).toBeTruthy();
    expect(entry!.fields).toMatchObject({ stream, group, consumer: 'c1' });
    expect(JSON.stringify(entry!.fields)).not.toContain('no-envelope-field');
    expect(redis.pendingCount(stream, group)).toBe(0); // acked, as before
  });

  it('a consumer-loop failure is reported (once per interval) and never thrown', async () => {
    const redis = new FakeRedisStreams();
    const bus = new RedisPlatformEventBus({ redis: redis as any });
    bus.registerConsumer('lead', ['calliq:stream:lead-events'], async () => {});
    redis.xreadgroup = async () => {
      throw new Error('NOGROUP simulated read failure');
    };
    const seen: Seen = [];
    bus.onTelemetry = (kind, fields) => seen.push({ kind, fields });

    await bus.start(); // runs one tick immediately
    bus.stop();

    const loopErrors = seen.filter((s) => s.kind === 'CONSUMER_LOOP_ERROR');
    expect(loopErrors).toHaveLength(1);
    expect(loopErrors[0].fields).toMatchObject({ consumer: 'lead' });
    expect(String(loopErrors[0].fields.error)).toContain('NOGROUP');
  });
});
