import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanKeys, deleteByPattern, forEachKey } from '../../../apps/gateway/src/services/redis-scan.js';

vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: {
    scan: vi.fn(),
    del: vi.fn(),
    unlink: vi.fn(),
    ttl: vi.fn(),
    expire: vi.fn(),
  },
}));

import { voiceRedis } from '../../../apps/gateway/src/services/voice/redis.client.js';

describe('scanKeys', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns keys from single scan batch', async () => {
    (voiceRedis.scan as any).mockResolvedValueOnce(['0', ['key1', 'key2', 'key3']]);
    const result = await scanKeys({ pattern: 'test:*', batchSize: 100 });
    expect(result.keys).toEqual(['key1', 'key2', 'key3']);
    expect(result.cursorCount).toBe(1);
    expect(result.timedOut).toBe(false);
  });

  it('iterates multiple cursor pages', async () => {
    (voiceRedis.scan as any)
      .mockResolvedValueOnce(['5', ['key1']])
      .mockResolvedValueOnce(['0', ['key2']]);
    const result = await scanKeys({ pattern: 'test:*', batchSize: 1 });
    expect(result.keys).toEqual(['key1', 'key2']);
    expect(result.cursorCount).toBe(2);
  });

  it('handles empty result set', async () => {
    (voiceRedis.scan as any).mockResolvedValueOnce(['0', []]);
    const result = await scanKeys({ pattern: 'test:*' });
    expect(result.keys).toEqual([]);
    expect(result.cursorCount).toBe(1);
  });

  it('handles scan errors gracefully', async () => {
    (voiceRedis.scan as any).mockRejectedValueOnce(new Error('Connection refused'));
    const result = await scanKeys({ pattern: 'test:*' });
    expect(result.keys).toEqual([]);
  });
});

describe('deleteByPattern', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes keys by pattern', async () => {
    (voiceRedis.scan as any).mockResolvedValueOnce(['0', ['k1', 'k2']]);
    (voiceRedis.unlink as any).mockResolvedValueOnce(2);
    const result = await deleteByPattern({ pattern: 'test:*' });
    expect(result.deleted).toBe(2);
    expect(voiceRedis.unlink).toHaveBeenCalledWith('k1', 'k2');
  });

  it('handles empty pattern', async () => {
    (voiceRedis.scan as any).mockResolvedValueOnce(['0', []]);
    const result = await deleteByPattern({ pattern: 'empty:*' });
    expect(result.deleted).toBe(0);
  });

  it('handles errors gracefully', async () => {
    (voiceRedis.scan as any).mockRejectedValueOnce(new Error('Timeout'));
    const result = await deleteByPattern({ pattern: 'test:*' });
    expect(result.deleted).toBe(0);
  });
});

describe('forEachKey', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('processes each key with callback', async () => {
    (voiceRedis.scan as any).mockResolvedValueOnce(['0', ['k1', 'k2']]);
    (voiceRedis.ttl as any).mockResolvedValue(100);
    const fn = vi.fn().mockResolvedValue(undefined);
    const result = await forEachKey('test:*', fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith('k1');
    expect(fn).toHaveBeenCalledWith('k2');
    expect(result.processed).toBe(2);
  });

  it('collects callback errors', async () => {
    (voiceRedis.scan as any).mockResolvedValueOnce(['0', ['k1', 'k2']]);
    const fn = vi.fn().mockRejectedValue(new Error('callback error'));
    const result = await forEachKey('test:*', fn);
    expect(result.errors).toBe(2);
  });
});
