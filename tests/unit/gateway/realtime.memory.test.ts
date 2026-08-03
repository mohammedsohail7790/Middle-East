import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealtimeMemoryManager } from '../../../apps/gateway/src/services/realtime/realtime.memory.js';
import type { ConversationSummary } from '../../../apps/gateway/src/services/realtime/realtime.memory.js';

vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: {
    setex: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn(),
    lpush: vi.fn().mockResolvedValue(1),
    ltrim: vi.fn().mockResolvedValue('OK'),
    expire: vi.fn().mockResolvedValue(1),
    lrange: vi.fn(),
    ttl: vi.fn(),
    scan: vi.fn(),
    unlink: vi.fn().mockResolvedValue(2),
  },
}));

import { voiceRedis } from '../../../apps/gateway/src/services/voice/redis.client.js';

describe('RealtimeMemoryManager', () => {
  let mgr: RealtimeMemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = new RealtimeMemoryManager();
  });

  it('stores and retrieves memory', async () => {
    await mgr.storeMemory({
      sessionId: 'sess-1', tenantId: 'tenant-1', callSid: 'call-1',
      type: 'customer_info', key: 'name', value: 'John Doe', timestamp: new Date(),
    });
    expect(voiceRedis.setex).toHaveBeenCalled();
  });

  it('stores customer info fields individually', async () => {
    await mgr.storeCustomerInfo('sess-1', 'tenant-1', 'call-1', 'Jane', '+15551112222', 'jane@test.com');
    expect(voiceRedis.setex).toHaveBeenCalledTimes(3);
  });

  it('stores intent with confidence', async () => {
    await mgr.storeIntent('sess-1', 'tenant-1', 'call-1', 'booking', 0.95);
    const call = (voiceRedis.setex as any).mock.calls[0];
    const value = JSON.parse(call[2]);
    expect(value.value).toEqual({ intent: 'booking', confidence: 0.95 });
  });

  it('stores entities', async () => {
    await mgr.storeEntity('sess-1', 'tenant-1', 'call-1', 'service', 'HVAC Repair');
    expect(voiceRedis.setex).toHaveBeenCalled();
  });

  it('stores conversation context', async () => {
    await mgr.storeConversationContext('sess-1', 'tenant-1', 'call-1', { topic: 'pricing' });
    expect(voiceRedis.setex).toHaveBeenCalled();
  });

  it('saves and retrieves conversation summary', async () => {
    const summary: ConversationSummary = {
      sessionId: 'sess-1', tenantId: 'tenant-1', callSid: 'call-1',
      customerName: 'John', primaryIntent: 'booking', topics: ['pricing'],
      sentiment: 'positive', outcome: 'completed', duration: 120000,
      transcript: '', summary: 'Test call', createdAt: new Date(),
    };
    await mgr.saveConversationSummary(summary);
    expect(voiceRedis.setex).toHaveBeenCalled();
    expect(voiceRedis.lpush).toHaveBeenCalled();
    expect(voiceRedis.ltrim).toHaveBeenCalledWith(expect.any(String), 0, 99);
  });

  it('retrieves tenant conversation history', async () => {
    const summary: ConversationSummary = {
      sessionId: 'sess-1', tenantId: 'tenant-1', callSid: 'call-1',
      sentiment: 'neutral', outcome: 'completed', duration: 60000,
      topics: [], transcript: '', summary: '', createdAt: new Date(),
    };
    (voiceRedis.lrange as any).mockResolvedValue([JSON.stringify(summary)]);
    const history = await mgr.getTenantConversationHistory('tenant-1');
    expect(history.length).toBe(1);
    expect(history[0].sessionId).toBe('sess-1');
  });

  it('clears session memory via scan+del', async () => {
    (voiceRedis.scan as any).mockResolvedValue(['0', ['mem:1', 'mem:2']]);
    await mgr.clearSessionMemory('sess-1');
    expect(voiceRedis.scan).toHaveBeenCalled();
    expect(voiceRedis.unlink).toHaveBeenCalled();
  });

  it('handles errors gracefully in getMemory', async () => {
    (voiceRedis.get as any).mockRejectedValue(new Error('Redis error'));
    const result = await mgr.getMemory('sess-1', 'customer_info', 'name');
    expect(result).toBeNull();
  });

  it('handles errors gracefully in clearSessionMemory', async () => {
    (voiceRedis.scan as any).mockRejectedValue(new Error('Scan error'));
    await expect(mgr.clearSessionMemory('sess-1')).resolves.toBeUndefined();
  });
});
