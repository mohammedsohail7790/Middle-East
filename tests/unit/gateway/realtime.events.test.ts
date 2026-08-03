import { describe, it, expect, beforeEach } from 'vitest';
import { RealtimeEventManager } from '../../../apps/gateway/src/services/realtime/realtime.events.js';
import { RealtimeSession } from '../../../apps/gateway/src/services/realtime/realtime.types.js';

function makeSession(overrides?: Partial<RealtimeSession>): RealtimeSession {
  return {
    id: 'test-session',
    tenantId: 'tenant-1',
    callSid: 'call-1',
    streamSid: 'stream-1',
    openAiWs: null,
    twilioWs: null,
    startTime: new Date(),
    lastActivity: new Date(),
    isActive: true,
    config: {
      tenantId: 'tenant-1',
      callSid: 'call-1',
      streamSid: 'stream-1',
      language: 'en',
      voice: 'alloy',
      instructions: '',
      tools: [],
      temperature: 0.7,
    },
    ...overrides,
  };
}

describe('RealtimeEventManager', () => {
  let mgr: RealtimeEventManager;

  beforeEach(() => {
    mgr = new RealtimeEventManager();
  });

  it('starts session metrics', () => {
    const session = makeSession();
    mgr.startSession(session);
    const metrics = mgr.getSessionMetrics(session.id);
    expect(metrics).not.toBeUndefined();
    expect(metrics!.sessionId).toBe(session.id);
    expect(metrics!.turnCount).toBe(0);
  });

  it('records turns with running latency average', () => {
    const session = makeSession();
    mgr.startSession(session);

    mgr.recordTurn(session.id, 100);
    mgr.recordTurn(session.id, 200);
    mgr.recordTurn(session.id, 300);

    const metrics = mgr.getSessionMetrics(session.id)!;
    expect(metrics.turnCount).toBe(3);
    expect(metrics.averageLatency).toBe(200); // (100+200+300)/3
  });

  it('records interruptions', () => {
    const session = makeSession();
    mgr.startSession(session);

    mgr.recordInterruption(session.id);
    mgr.recordInterruption(session.id);

    const metrics = mgr.getSessionMetrics(session.id)!;
    expect(metrics.interruptionCount).toBe(2);
  });

  it('records tool calls', () => {
    const session = makeSession();
    mgr.startSession(session);

    mgr.recordToolCall(session.id, 'create_appointment', 150);

    const metrics = mgr.getSessionMetrics(session.id)!;
    expect(metrics.toolCallCount).toBe(1);
  });

  it('records token usage', () => {
    const session = makeSession();
    mgr.startSession(session);

    mgr.recordTokenUsage(session.id, 100, 50);
    mgr.recordTokenUsage(session.id, 200, 100);

    const metrics = mgr.getSessionMetrics(session.id)!;
    expect(metrics.tokensUsed).toBe(450); // (100+50)+(200+100)
  });

  it('records errors', () => {
    const session = makeSession();
    mgr.startSession(session);

    mgr.recordError(session.id, 'tool_timeout', 'create_appointment timed out');
    const events = mgr.getRecentEvents(session.id);
    expect(events.some(e => e.type === 'error')).toBe(true);
  });

  it('endSession calculates duration and outcome', () => {
    const session = makeSession();
    mgr.startSession(session);

    mgr.recordTurn(session.id, 100);
    mgr.recordTurn(session.id, 200);

    mgr.endSession(session, 'completed');

    const metrics = mgr.getSessionMetrics(session.id);
    expect(metrics).toBeUndefined(); // cleaned up after end
  });

  it('getTenantMetrics aggregates across sessions', () => {
    const s1 = makeSession({ id: 's1', tenantId: 'tenant-1' });
    const s2 = makeSession({ id: 's2', tenantId: 'tenant-1' });

    mgr.startSession(s1);
    mgr.startSession(s2);
    mgr.recordToolCall(s1.id, 'transfer_call', 50);
    mgr.recordTurn(s1.id, 300);
    mgr.recordTurn(s2.id, 150);

    const tm = mgr.getTenantMetrics('tenant-1');
    expect(tm.activeSessions).toBe(2);
    expect(tm.totalTurns).toBe(2);
    expect(tm.totalToolCalls).toBe(1);
  });

  it('cleanupOldEvents removes events beyond cutoff', () => {
    const session = makeSession();
    mgr.startSession(session);
    mgr.recordTurn(session.id, 100);
    mgr.recordTurn(session.id, 100);

    // Force all events to be old by setting cutoff to 0 hours
    mgr.cleanupOldEvents(0);
    // Sleep briefly to ensure time passes
    const events = mgr.getRecentEvents(session.id);
    expect(events.length).toBe(0);
  });
});
