import { describe, it, expect, beforeEach } from 'vitest';
import { AudioDiagnosticsManager } from '../../../apps/gateway/src/services/realtime/realtime.audio-diag.js';

describe('AudioDiagnosticsManager', () => {
  let mgr: AudioDiagnosticsManager;

  beforeEach(() => { mgr = new AudioDiagnosticsManager(); });

  it('starts a session', () => {
    mgr.startSession('sess-1', 'call-1', 'tenant-1');
    const snap = mgr.getSnapshot('sess-1');
    expect(snap).not.toBeNull();
    expect(snap!.sessionId).toBe('sess-1');
    expect(snap!.callSid).toBe('call-1');
    expect(snap!.tenantId).toBe('tenant-1');
  });

  it('records inbound frames', () => {
    mgr.startSession('sess-1', 'call-1', 'tenant-1');
    const frame = Buffer.alloc(160, 0x80).toString('base64'); // μ-law zero
    mgr.recordInboundFrame('sess-1', frame);

    const snap = mgr.getSnapshot('sess-1')!;
    expect(snap.inbound.totalFrames).toBe(1);
    expect(snap.inbound.totalBytes).toBe(frame.length);
  });

  it('detects silence (μ-law 0x80 = zero level)', () => {
    mgr.startSession('sess-1', 'call-1', 'tenant-1');
    const zeroFrame = Buffer.alloc(160, 0x80).toString('base64');
    mgr.recordInboundFrame('sess-1', zeroFrame);

    const snap = mgr.getSnapshot('sess-1')!;
    expect(snap.inbound.silenceFrames).toBe(1);
    expect(snap.inbound.averageLevel).toBe(0);
  });

  it('detects clipping (μ-law 0x00 = max amplitude)', () => {
    mgr.startSession('sess-1', 'call-1', 'tenant-1');
    const maxFrame = Buffer.alloc(160, 0x00).toString('base64');
    mgr.recordInboundFrame('sess-1', maxFrame);

    const snap = mgr.getSnapshot('sess-1')!;
    expect(snap.inbound.clippingFrames).toBe(1);
    expect(snap.inbound.peakLevel).toBe(128);
  });

  it('tracks frame intervals', () => {
    mgr.startSession('sess-1', 'call-1', 'tenant-1');
    const frame = Buffer.alloc(160, 0x80).toString('base64');
    mgr.recordInboundFrame('sess-1', frame);
    mgr.recordInboundFrame('sess-1', frame);

    const snap = mgr.getSnapshot('sess-1')!;
    expect(snap.inbound.totalFrames).toBe(2);
    expect(snap.inbound.frameInterval.avg).toBeGreaterThanOrEqual(0);
  });

  it('detects dropped frames', () => {
    mgr.startSession('sess-1', 'call-1', 'tenant-1');
    const frame = Buffer.alloc(160, 0x80).toString('base64');
    mgr.recordInboundFrame('sess-1', frame);

    // Force a large gap by manipulating the stored lastInboundAt
    const diag = (mgr as any).diagnostics.get('sess-1');
    diag.lastInboundAt = Date.now() - 200;

    mgr.recordInboundFrame('sess-1', frame);
    const snap = mgr.getSnapshot('sess-1')!;
    expect(snap.inbound.droppedFrames).toBeGreaterThan(0);
  });

  it('records outbound frames separately', () => {
    mgr.startSession('sess-1', 'call-1', 'tenant-1');
    const frame = Buffer.alloc(160, 0x80).toString('base64');
    mgr.recordInboundFrame('sess-1', frame);
    mgr.recordOutboundFrame('sess-1', frame);

    const snap = mgr.getSnapshot('sess-1')!;
    expect(snap.inbound.totalFrames).toBe(1);
    expect(snap.outbound.totalFrames).toBe(1);
  });

  it('tracks playback gaps and interruption overlaps', () => {
    mgr.startSession('sess-1', 'call-1', 'tenant-1');
    mgr.recordPlaybackGap('sess-1');
    mgr.recordPlaybackGap('sess-1');
    mgr.recordInterruptionOverlap('sess-1');

    expect(mgr.getSnapshot('sess-1')!.playbackGaps).toBe(2);
    expect(mgr.getSnapshot('sess-1')!.interruptionOverlaps).toBe(1);
  });

  it('endSession cleans up', () => {
    mgr.startSession('sess-1', 'call-1', 'tenant-1');
    const result = mgr.endSession('sess-1');
    expect(result).not.toBeNull();
    expect(mgr.getSnapshot('sess-1')).toBeNull();
  });

  it('returns null for unknown session', () => {
    expect(mgr.getSnapshot('nonexistent')).toBeNull();
    expect(mgr.endSession('nonexistent')).toBeNull();
  });

  it('tracks active session count', () => {
    expect(mgr.getSessionCount()).toBe(0);
    mgr.startSession('s1', 'c1', 't1');
    mgr.startSession('s2', 'c2', 't1');
    expect(mgr.getSessionCount()).toBe(2);
  });

  it('multiple sessions are independent', () => {
    mgr.startSession('s1', 'c1', 't1');
    mgr.startSession('s2', 'c2', 't2');
    const frame = Buffer.alloc(160, 0x80).toString('base64');
    mgr.recordInboundFrame('s1', frame);
    mgr.recordOutboundFrame('s2', frame);

    expect(mgr.getSnapshot('s1')!.inbound.totalFrames).toBe(1);
    expect(mgr.getSnapshot('s1')!.outbound.totalFrames).toBe(0);
    expect(mgr.getSnapshot('s2')!.outbound.totalFrames).toBe(1);
  });

  it('bulk frame recording', () => {
    mgr.startSession('sess-1', 'call-1', 'tenant-1');
    const frame = Buffer.alloc(160, 0x80).toString('base64');
    for (let i = 0; i < 100; i++) mgr.recordInboundFrame('sess-1', frame);
    expect(mgr.getSnapshot('sess-1')!.inbound.totalFrames).toBe(100);
  });
});
