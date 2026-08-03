import { logger } from '../logger.js';
import { productionTelemetry } from '../voice/production-telemetry.js';

export interface AudioFrameMetrics {
  timestamp: number;
  payloadSize: number;
  inboundLevel: number;
  outboundLevel?: number;
  isSilence: boolean;
  isClipping: boolean;
  frameDelta: number;
}

export interface AudioDiagnostics {
  sessionId: string;
  callSid: string;
  tenantId: string;
  startTime: number;
  endTime?: number;
  inbound: {
    totalFrames: number;
    totalBytes: number;
    silenceFrames: number;
    clippingFrames: number;
    droppedFrames: number;
    averageLevel: number;
    peakLevel: number;
    minLevel: number;
    frameInterval: { min: number; max: number; avg: number; jitter: number };
  };
  outbound: {
    totalFrames: number;
    totalBytes: number;
    silenceFrames: number;
    clippingFrames: number;
    droppedFrames: number;
    averageLevel: number;
    peakLevel: number;
    minLevel: number;
    frameInterval: { min: number; max: number; avg: number; jitter: number };
  };
  playbackGaps: number;
  interruptionOverlaps: number;
  lastInboundAt: number;
  lastOutboundAt: number;
}

export class AudioDiagnosticsManager {
  private diagnostics = new Map<string, AudioDiagnostics>();
  private readonly frameHistorySize = 1000;
  private readonly silenceThreshold = 2;
  private readonly clippingThreshold = 120;

  startSession(sessionId: string, callSid: string, tenantId: string): void {
    const now = Date.now();
    this.diagnostics.set(sessionId, {
      sessionId,
      callSid,
      tenantId,
      startTime: now,
      inbound: {
        totalFrames: 0, totalBytes: 0, silenceFrames: 0, clippingFrames: 0, droppedFrames: 0,
        averageLevel: 0, peakLevel: 0, minLevel: 255,
        frameInterval: { min: 0, max: 0, avg: 0, jitter: 0 },
      },
      outbound: {
        totalFrames: 0, totalBytes: 0, silenceFrames: 0, clippingFrames: 0, droppedFrames: 0,
        averageLevel: 0, peakLevel: 0, minLevel: 255,
        frameInterval: { min: 0, max: 0, avg: 0, jitter: 0 },
      },
      playbackGaps: 0,
      interruptionOverlaps: 0,
      lastInboundAt: now,
      lastOutboundAt: now,
    });
  }

  recordInboundFrame(sessionId: string, payload: string): void {
    const diag = this.diagnostics.get(sessionId);
    if (!diag) return;

    const now = Date.now();
    const frameDelta = now - diag.lastInboundAt;
    const level = this.calculateAudioLevel(payload);
    const isSilence = level < this.silenceThreshold;
    const isClipping = level > this.clippingThreshold;

    const inbound = diag.inbound;
    inbound.totalFrames++;
    inbound.totalBytes += payload.length;
    if (isSilence) inbound.silenceFrames++;
    if (isClipping) inbound.clippingFrames++;

    inbound.averageLevel = ((inbound.averageLevel * (inbound.totalFrames - 1)) + level) / inbound.totalFrames;
    inbound.peakLevel = Math.max(inbound.peakLevel, level);
    inbound.minLevel = Math.min(inbound.minLevel, level);

    this.updateFrameInterval(inbound, frameDelta);
    diag.lastInboundAt = now;

    // Detect dropped frames: if gap > 40ms (2x expected 20ms interval)
    if (frameDelta > 40 && inbound.totalFrames > 1) {
      const expected = frameDelta / 20;
      const dropped = Math.round(expected) - 1;
      if (dropped > 0) inbound.droppedFrames += dropped;
    }
  }

  recordOutboundFrame(sessionId: string, payload: string): void {
    const diag = this.diagnostics.get(sessionId);
    if (!diag) return;

    const now = Date.now();
    const frameDelta = now - diag.lastOutboundAt;
    const level = this.calculateAudioLevel(payload);
    const isSilence = level < this.silenceThreshold;
    const isClipping = level > this.clippingThreshold;

    const outbound = diag.outbound;
    outbound.totalFrames++;
    outbound.totalBytes += payload.length;
    if (isSilence) outbound.silenceFrames++;
    if (isClipping) outbound.clippingFrames++;

    outbound.averageLevel = ((outbound.averageLevel * (outbound.totalFrames - 1)) + level) / outbound.totalFrames;
    outbound.peakLevel = Math.max(outbound.peakLevel, level);
    outbound.minLevel = Math.min(outbound.minLevel, level);

    this.updateFrameInterval(outbound, frameDelta);
    diag.lastOutboundAt = now;

    if (frameDelta > 40 && outbound.totalFrames > 1) {
      const expected = frameDelta / 20;
      const dropped = Math.round(expected) - 1;
      if (dropped > 0) outbound.droppedFrames += dropped;
    }
  }

  recordPlaybackGap(sessionId: string): void {
    const diag = this.diagnostics.get(sessionId);
    if (!diag) return;
    diag.playbackGaps++;
    productionTelemetry.incrementCounter('audio_playback_gap');
  }

  recordInterruptionOverlap(sessionId: string): void {
    const diag = this.diagnostics.get(sessionId);
    if (!diag) return;
    diag.interruptionOverlaps++;
    productionTelemetry.incrementCounter('audio_interruption_overlap');
  }

  getSnapshot(sessionId: string): AudioDiagnostics | null {
    return this.diagnostics.get(sessionId) || null;
  }

  endSession(sessionId: string): AudioDiagnostics | null {
    const diag = this.diagnostics.get(sessionId);
    if (!diag) return null;

    diag.endTime = Date.now();
    this.diagnostics.delete(sessionId);

    const totalDuration = diag.endTime - diag.startTime;
    const dropRate = diag.inbound.totalFrames > 0
      ? (diag.inbound.droppedFrames / diag.inbound.totalFrames) * 100
      : 0;

    productionTelemetry.incrementCounter('audio_sessions_completed');
    if (dropRate > 5) {
      logger.warn('AUDIO_HIGH_DROP_RATE', {
        sessionId,
        dropRate: Math.round(dropRate * 100) / 100,
        droppedFrames: diag.inbound.droppedFrames,
        totalFrames: diag.inbound.totalFrames,
      });
      productionTelemetry.incrementCounter('audio_high_drop_rate');
    }

    logger.info('AUDIO_DIAGNOSTICS_SUMMARY', {
      sessionId,
      durationMs: totalDuration,
      inboundFrames: diag.inbound.totalFrames,
      outboundFrames: diag.outbound.totalFrames,
      silencePercent: diag.inbound.totalFrames > 0
        ? Math.round((diag.inbound.silenceFrames / diag.inbound.totalFrames) * 100)
        : 0,
      clippingFrames: diag.inbound.clippingFrames,
      droppedFrames: diag.inbound.droppedFrames,
      dropRate: Math.round(dropRate * 100) / 100,
      playbackGaps: diag.playbackGaps,
      interruptionOverlaps: diag.interruptionOverlaps,
      avgInboundLevel: Math.round(diag.inbound.averageLevel),
      avgOutboundLevel: Math.round(diag.outbound.averageLevel),
    });

    return diag;
  }

  private calculateAudioLevel(base64Payload: string): number {
    try {
      const buf = Buffer.from(base64Payload, 'base64');
      if (buf.length === 0) return 0;

      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        sum += Math.abs(buf[i] - 128);
      }
      return sum / buf.length;
    } catch {
      return 0;
    }
  }

  private updateFrameInterval(
    direction: AudioDiagnostics['inbound'] | AudioDiagnostics['outbound'],
    delta: number
  ): void {
    const prev = direction.frameInterval.avg;
    const count = direction.totalFrames;

    if (count <= 1) {
      direction.frameInterval = { min: delta, max: delta, avg: delta, jitter: 0 };
      return;
    }

    direction.frameInterval.min = Math.min(direction.frameInterval.min, delta);
    direction.frameInterval.max = Math.max(direction.frameInterval.max, delta);
    direction.frameInterval.avg = ((prev * (count - 1)) + delta) / count;
    direction.frameInterval.jitter = Math.abs(delta - direction.frameInterval.avg);
  }

  getActiveSessions(): string[] {
    return Array.from(this.diagnostics.keys());
  }

  getSessionCount(): number {
    return this.diagnostics.size;
  }
}

export const audioDiagnosticsManager = new AudioDiagnosticsManager();
