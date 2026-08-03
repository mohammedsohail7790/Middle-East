/**
 * Synthetic Caller Framework - Audio Utilities
 * 
 * Utilities for generating, encoding, and manipulating audio for synthetic callers.
 * Supports μ-law encoding (Twilio format) and various audio manipulations.
 */

import { AudioFrame } from '../framework/types.js';

/**
 * Generate silence audio frames
 */
export function generateSilence(durationMs: number, sampleRate: number = 8000): AudioFrame[] {
  const samplesPerFrame = Math.floor(sampleRate * 0.02); // 20ms frames
  const frameCount = Math.ceil(durationMs / 20);
  const frames: AudioFrame[] = [];

  for (let i = 0; i < frameCount; i++) {
    const silenceBuffer = Buffer.alloc(samplesPerFrame, 0xFF); // μ-law silence = 0xFF
    frames.push({
      payload: silenceBuffer.toString('base64'),
      timestamp: Date.now() + (i * 20),
      sequenceNumber: i,
    });
  }

  return frames;
}

/**
 * Generate simple tone audio (for testing)
 */
export function generateTone(
  frequencyHz: number,
  durationMs: number,
  sampleRate: number = 8000
): AudioFrame[] {
  const samplesPerFrame = Math.floor(sampleRate * 0.02); // 20ms frames
  const frameCount = Math.ceil(durationMs / 20);
  const frames: AudioFrame[] = [];

  for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
    const samples = new Int16Array(samplesPerFrame);
    
    for (let i = 0; i < samplesPerFrame; i++) {
      const sampleIdx = frameIdx * samplesPerFrame + i;
      const t = sampleIdx / sampleRate;
      const amplitude = 8000; // Amplitude for 16-bit PCM
      samples[i] = Math.floor(amplitude * Math.sin(2 * Math.PI * frequencyHz * t));
    }

    // Convert PCM to μ-law
    const mulawBuffer = pcmToMulaw(samples);
    
    frames.push({
      payload: mulawBuffer.toString('base64'),
      timestamp: Date.now() + (frameIdx * 20),
      sequenceNumber: frameIdx,
    });
  }

  return frames;
}

/**
 * Convert 16-bit PCM to μ-law encoding
 */
export function pcmToMulaw(pcmSamples: Int16Array): Buffer {
  const mulawSamples = Buffer.alloc(pcmSamples.length);
  
  for (let i = 0; i < pcmSamples.length; i++) {
    mulawSamples[i] = linearToMulaw(pcmSamples[i]);
  }
  
  return mulawSamples;
}

/**
 * Convert single PCM sample to μ-law
 */
function linearToMulaw(sample: number): number {
  const MULAW_MAX = 0x1FFF;
  const MULAW_BIAS = 33;
  
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) {
    sample = -sample;
  }
  
  if (sample > MULAW_MAX) {
    sample = MULAW_MAX;
  }
  
  sample = sample + MULAW_BIAS;
  let exponent = 7;
  
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  
  const mantissa = (sample >> (exponent + 3)) & 0x0F;
  const mulawByte = ~(sign | (exponent << 4) | mantissa);
  
  return mulawByte & 0xFF;
}

/**
 * Add background noise to audio frames
 */
export function addBackgroundNoise(
  frames: AudioFrame[],
  noiseType: 'traffic' | 'construction' | 'crowd' | 'wind' | 'office' | 'restaurant',
  volume: number = 0.3
): AudioFrame[] {
  // For now, add simple white noise
  // In production, this would load actual noise samples
  return frames.map(frame => {
    const decoded = Buffer.from(frame.payload, 'base64');
    const noisy = Buffer.alloc(decoded.length);
    
    for (let i = 0; i < decoded.length; i++) {
      const original = mulawToLinear(decoded[i]);
      const noise = (Math.random() - 0.5) * 2 * 4000 * volume; // Random noise
      const mixed = Math.max(-32768, Math.min(32767, original + noise));
      noisy[i] = linearToMulaw(mixed);
    }
    
    return {
      ...frame,
      payload: noisy.toString('base64'),
    };
  });
}

/**
 * Convert μ-law sample to linear PCM
 */
function mulawToLinear(mulawByte: number): number {
  mulawByte = ~mulawByte;
  const sign = (mulawByte & 0x80) !== 0;
  const exponent = (mulawByte >> 4) & 0x07;
  const mantissa = mulawByte & 0x0F;
  
  let sample = mantissa << (exponent + 3);
  sample += (1 << (exponent + 2)) - 33;
  
  return sign ? -sample : sample;
}

/**
 * Adjust audio speed (for fast/slow talkers)
 */
export function adjustSpeed(frames: AudioFrame[], speedMultiplier: number): AudioFrame[] {
  if (speedMultiplier === 1.0) return frames;
  
  // Simple time-stretching by resampling
  // In production, use proper time-stretching algorithm
  const targetFrameCount = Math.floor(frames.length / speedMultiplier);
  const adjusted: AudioFrame[] = [];
  
  for (let i = 0; i < targetFrameCount; i++) {
    const sourceIdx = Math.floor(i * speedMultiplier);
    if (sourceIdx < frames.length) {
      adjusted.push({
        ...frames[sourceIdx],
        sequenceNumber: i,
        timestamp: Date.now() + (i * 20),
      });
    }
  }
  
  return adjusted;
}

/**
 * Create audio frames from text (placeholder for TTS integration)
 */
export async function textToAudio(
  text: string,
  options: {
    voice?: string;
    speed?: number;
    pitch?: number;
  } = {}
): Promise<AudioFrame[]> {
  // Placeholder: In production, integrate with TTS service (OpenAI TTS, ElevenLabs, etc.)
  // For now, generate tone-based audio with duration based on text length
  
  const wordsPerMinute = 150 * (options.speed || 1.0);
  const words = text.split(/\s+/).length;
  const durationMs = (words / wordsPerMinute) * 60 * 1000;
  
  // Generate a simple tone as placeholder
  let frames = generateTone(440, durationMs); // A4 note
  
  // Adjust speed if specified
  if (options.speed && options.speed !== 1.0) {
    frames = adjustSpeed(frames, options.speed);
  }
  
  return frames;
}

/**
 * Calculate audio duration from frames
 */
export function calculateDuration(frames: AudioFrame[]): number {
  if (frames.length === 0) return 0;
  return frames.length * 20; // 20ms per frame
}

/**
 * Merge multiple audio frame arrays
 */
export function mergeAudioFrames(...frameArrays: AudioFrame[][]): AudioFrame[] {
  const merged: AudioFrame[] = [];
  let sequenceNumber = 0;
  let timestamp = Date.now();
  
  for (const frames of frameArrays) {
    for (const frame of frames) {
      merged.push({
        ...frame,
        sequenceNumber: sequenceNumber++,
        timestamp: timestamp,
      });
      timestamp += 20;
    }
  }
  
  return merged;
}

/**
 * Insert silence between audio frames
 */
export function insertSilence(
  frames: AudioFrame[],
  silenceDurationMs: number,
  position: number
): AudioFrame[] {
  const silenceFrames = generateSilence(silenceDurationMs);
  const before = frames.slice(0, position);
  const after = frames.slice(position);
  
  return mergeAudioFrames(before, silenceFrames, after);
}

/**
 * Validate audio frame format
 */
export function validateAudioFrame(frame: AudioFrame): boolean {
  if (!frame.payload || typeof frame.payload !== 'string') return false;
  if (typeof frame.timestamp !== 'number') return false;
  if (typeof frame.sequenceNumber !== 'number') return false;
  
  // Validate base64 encoding
  try {
    Buffer.from(frame.payload, 'base64');
    return true;
  } catch {
    return false;
  }
}
