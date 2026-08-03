import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../apps/gateway/src/services/realtime/realtime-session-redis.js', () => ({
  saveRuntimeSessionSnapshot: vi.fn(async () => {}),
  loadRuntimeSessionIdByCallSid: vi.fn(async () => null),
  loadRuntimeSessionSnapshot: vi.fn(async () => null),
  deleteRuntimeSessionRedis: vi.fn(async () => {}),
}));

import { SessionRegistry } from '../../../apps/gateway/src/services/realtime/session-registry.js';
import { CallRuntimeSession } from '../../../apps/gateway/src/services/realtime/realtime-session.js';
import {
  markTransportAttachOnce,
  shouldExecuteTool,
  transportAttachKey,
} from '../../../apps/gateway/src/services/realtime/session-idempotency.js';

describe('P1-A SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
    process.env.CALLIQ_P1_RUNTIME_SESSION = 'true';
  });

  it('creates exactly one runtime session per callSid', async () => {
    const a = registry.create({
      tenantId: 't1',
      callSid: 'CA111',
      wsSessionId: 'ws_a',
    });
    const b = await registry.getOrCreate({
      tenantId: 't1',
      callSid: 'CA111',
      wsSessionId: 'ws_b',
    });
    expect(a.sessionId).toBe(b.sessionId);
    expect(registry.activeCount()).toBe(1);
  });

  it('reuses session on reconnect attach', async () => {
    const first = registry.create({
      tenantId: 't1',
      callSid: 'CA222',
      wsSessionId: 'ws_1',
    });
    registry.bindVoiceSession(first, 'voice_old');
    registry.detachTransport(first, 'test');
    const second = await registry.getOrCreate({
      tenantId: 't1',
      callSid: 'CA222',
      wsSessionId: 'ws_2',
    });
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.metrics.reconnectCount).toBeGreaterThanOrEqual(1);
    expect(second.voiceSessionId).toBe('voice_old');
  });

  it('terminates and removes from index', () => {
    const s = registry.create({ tenantId: 't1', callSid: 'CA333' });
    registry.terminate(s.sessionId);
    expect(registry.getByCallSid('CA333')).toBeUndefined();
    expect(registry.getBySessionId(s.sessionId)).toBeUndefined();
  });
});

describe('P1-A idempotency', () => {
  it('dedupes duplicate transport attach keys', () => {
    const key = transportAttachKey('rt_1', 'ws_x', 1);
    expect(markTransportAttachOnce(key)).toBe(true);
    expect(markTransportAttachOnce(key)).toBe(false);
  });

  it('dedupes tool execution within window', () => {
    expect(shouldExecuteTool('sess', 'create_appointment', 'k1')).toBe(true);
    expect(shouldExecuteTool('sess', 'create_appointment', 'k1')).toBe(false);
  });
});

describe('CallRuntimeSession overlap intervals', () => {
  it('appendTranscript dedupes adjacent identical lines', () => {
    const s = new CallRuntimeSession({ tenantId: 't', callSid: 'CA' });
    s.appendTranscript('caller', 'hello');
    s.appendTranscript('caller', 'hello');
    expect(s.transcriptBuffer).toHaveLength(1);
  });
});
