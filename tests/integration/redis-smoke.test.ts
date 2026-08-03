import { describe, it, expect, afterAll } from 'vitest';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

describe('Redis integration smoke', () => {
  const client = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5000 });

  afterAll(async () => {
    await client.quit();
  });

  it('connects and responds to PING', async () => {
    const pong = await client.ping();
    expect(pong).toBe('PONG');
  });

  it('supports set/get for session-style keys', async () => {
    const key = `calliq:ci:smoke:${Date.now()}`;
    await client.set(key, 'ok', 'EX', 30);
    const value = await client.get(key);
    expect(value).toBe('ok');
    await client.del(key);
  });
});
