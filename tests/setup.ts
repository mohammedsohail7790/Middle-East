
import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

vi.mock('../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    lpush: vi.fn(async () => 1),
    ltrim: vi.fn(async () => 'OK'),
    lrange: vi.fn(async () => []),
    ping: vi.fn(async () => 'PONG'),
    publish: vi.fn(async () => 1),
  },
}));

// Global test setup
beforeAll(() => {
    // console.log('Starting test suite');
});

afterAll(() => {
    // console.log('Finished test suite');
});

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});
