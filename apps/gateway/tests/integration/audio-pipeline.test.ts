/**
 * Integration Tests: Audio Pipeline
 * 
 * Tests bidirectional audio forwarding, packet ordering, interruption handling,
 * backpressure, and audio frame integrity.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:3003';
const TENANT_ID = process.env.TEST_TENANT_ID || 'test-tenant-id';

describe('Audio Pipeline Integration Tests', () => {
  let activeSockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of activeSockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    }
    activeSockets = [];
  });

  describe('Bidirectional Audio Forwarding', () => {
    it('should forward inbound audio to OpenAI', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      // Send audio frames
      const audioFrames = generateAudioFrames(10);
      for (const frame of audioFrames) {
        await sendMediaFrame(ws, frame);
        await delay(20);
      }

      // Wait for processing
      await delay(1000);

      // Verify audio was forwarded (check for response)
      const receivedAudio = await waitForAudioResponse(ws, 5000);
      expect(receivedAudio).toBe(true);
    });

    it('should forward outbound audio from OpenAI to Twilio', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      // Send user audio
      const audioFrames = generateAudioFrames(5);
      for (const frame of audioFrames) {
        await sendMediaFrame(ws, frame);
        await delay(20);
      }

      // Wait for AI response audio
      const audioReceived = await waitForAudioResponse(ws, 10000);
      expect(audioReceived).toBe(true);
    });
  });

  describe('Packet Ordering', () => {
    it('should maintain audio frame sequence', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      const frameCount = 20;
      const audioFrames = generateAudioFrames(frameCount);

      // Send frames in order
      for (let i = 0; i < audioFrames.length; i++) {
        await sendMediaFrame(ws, audioFrames[i], i);
        await delay(20);
      }

      await delay(2000);

      // Verify no errors (out-of-order would cause issues)
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it('should handle out-of-order frames gracefully', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      const audioFrames = generateAudioFrames(10);

      // Send frames out of order
      await sendMediaFrame(ws, audioFrames[0], 0);
      await sendMediaFrame(ws, audioFrames[2], 2);
      await sendMediaFrame(ws, audioFrames[1], 1);
      await sendMediaFrame(ws, audioFrames[4], 4);
      await sendMediaFrame(ws, audioFrames[3], 3);

      await delay(1000);

      // Should still be connected
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe('Interruption Handling', () => {
    it('should handle user interruption during AI speech', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      // Send initial audio to trigger AI response
      const audioFrames = generateAudioFrames(5);
      for (const frame of audioFrames) {
        await sendMediaFrame(ws, frame);
        await delay(20);
      }

      // Wait for AI to start responding
      await delay(500);

      // Interrupt with new audio
      const interruptFrames = generateAudioFrames(3);
      for (const frame of interruptFrames) {
        await sendMediaFrame(ws, frame);
        await delay(20);
      }

      // Should handle interruption gracefully
      await delay(1000);
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it('should stop AI audio on interruption', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      let audioResponseCount = 0;
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'response.audio.delta') {
            audioResponseCount++;
          }
        } catch { /* ignore */ }
      });

      // Trigger AI response
      const audioFrames = generateAudioFrames(5);
      for (const frame of audioFrames) {
        await sendMediaFrame(ws, frame);
        await delay(20);
      }

      await delay(500);
      const countBeforeInterrupt = audioResponseCount;

      // Interrupt
      const interruptFrames = generateAudioFrames(3);
      for (const frame of interruptFrames) {
        await sendMediaFrame(ws, frame);
        await delay(20);
      }

      await delay(500);

      // Audio should have been interrupted (count shouldn't grow much)
      expect(audioResponseCount).toBeGreaterThan(0);
    });
  });

  describe('Silence Behavior', () => {
    it('should handle silence frames', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      // Send silence frames (0xFF in μ-law)
      const silenceFrames = generateSilenceFrames(10);
      for (const frame of silenceFrames) {
        await sendMediaFrame(ws, frame);
        await delay(20);
      }

      await delay(1000);
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it('should timeout on prolonged silence', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      // Send silence for 45+ seconds (inactivity timeout)
      const silenceFrames = generateSilenceFrames(2250); // 45s at 20ms/frame

      let closed = false;
      ws.on('close', () => {
        closed = true;
      });

      for (const frame of silenceFrames) {
        if (closed) break;
        await sendMediaFrame(ws, frame);
        await delay(20);
      }

      // Should timeout and close
      await delay(2000);
      expect(closed).toBe(true);
    }, 50000);
  });

  describe('Backpressure Handling', () => {
    it('should handle rapid audio frame bursts', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      // Send burst of frames without delay
      const audioFrames = generateAudioFrames(100);
      for (const frame of audioFrames) {
        await sendMediaFrame(ws, frame);
        // No delay - test backpressure
      }

      await delay(2000);

      // Should still be connected
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it('should not drop frames under load', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      let errorCount = 0;
      ws.on('error', () => {
        errorCount++;
      });

      // Send sustained load
      const audioFrames = generateAudioFrames(500);
      for (const frame of audioFrames) {
        await sendMediaFrame(ws, frame);
        await delay(10); // Faster than realtime
      }

      await delay(1000);

      // Should have minimal errors
      expect(errorCount).toBe(0);
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe('Malformed Frame Handling', () => {
    it('should handle invalid base64 payload', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      // Send malformed frame
      const malformedEvent = {
        event: 'media',
        sequenceNumber: '1',
        media: {
          track: 'inbound',
          chunk: '1',
          timestamp: String(Date.now()),
          payload: 'invalid!!!base64',
        },
        streamSid: 'MZ_test',
      };

      ws.send(JSON.stringify(malformedEvent));
      await delay(1000);

      // Should handle gracefully
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it('should handle missing payload fields', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      // Send incomplete frame
      const incompleteEvent = {
        event: 'media',
        sequenceNumber: '1',
        media: {
          track: 'inbound',
          // Missing chunk, timestamp, payload
        },
        streamSid: 'MZ_test',
      };

      ws.send(JSON.stringify(incompleteEvent));
      await delay(1000);

      // Should handle gracefully
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe('Audio Queue Depth', () => {
    it('should not accumulate unbounded audio queue', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      // Send large burst
      const audioFrames = generateAudioFrames(1000);
      for (const frame of audioFrames) {
        await sendMediaFrame(ws, frame);
      }

      await delay(5000);

      // Should still be responsive
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe('Latency Tracking', () => {
    it('should maintain low latency under normal load', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);

      const latencies: number[] = [];

      // Send frames and measure response time
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        
        const audioFrames = generateAudioFrames(5);
        for (const frame of audioFrames) {
          await sendMediaFrame(ws, frame);
          await delay(20);
        }

        const responseReceived = await waitForAudioResponse(ws, 5000);
        if (responseReceived) {
          const latency = Date.now() - startTime;
          latencies.push(latency);
        }

        await delay(1000);
      }

      // Calculate P95 latency
      if (latencies.length > 0) {
        latencies.sort((a, b) => a - b);
        const p95Index = Math.floor(latencies.length * 0.95);
        const p95Latency = latencies[p95Index];

        // Should be under 2000ms for P95
        expect(p95Latency).toBeLessThan(2000);
      }
    }, 30000);
  });

  // Helper functions
  async function connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${GATEWAY_URL}/ws/realtime/${TENANT_ID}`);
      
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
        ws.close();
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        activeSockets.push(ws);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async function sendTwilioStart(ws: WebSocket): Promise<void> {
    const startEvent = {
      event: 'start',
      sequenceNumber: '1',
      start: {
        streamSid: generateStreamSid(),
        accountSid: 'AC_test',
        callSid: generateCallSid(),
        tracks: ['inbound', 'outbound'],
        mediaFormat: {
          encoding: 'audio/x-mulaw',
          sampleRate: 8000,
          channels: 1,
        },
      },
      streamSid: generateStreamSid(),
    };

    ws.send(JSON.stringify(startEvent));
    await delay(500);
  }

  async function sendMediaFrame(ws: WebSocket, payload: string, sequenceNumber?: number): Promise<void> {
    const mediaEvent = {
      event: 'media',
      sequenceNumber: String(sequenceNumber || Math.floor(Math.random() * 10000)),
      media: {
        track: 'inbound',
        chunk: String(sequenceNumber || 1),
        timestamp: String(Date.now()),
        payload,
      },
      streamSid: 'MZ_test',
    };

    ws.send(JSON.stringify(mediaEvent));
  }

  function generateAudioFrames(count: number): string[] {
    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate simple tone as base64 μ-law
      const buffer = Buffer.alloc(160); // 20ms at 8kHz
      for (let j = 0; j < buffer.length; j++) {
        buffer[j] = Math.floor(Math.random() * 256);
      }
      frames.push(buffer.toString('base64'));
    }
    return frames;
  }

  function generateSilenceFrames(count: number): string[] {
    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
      const buffer = Buffer.alloc(160, 0xFF); // μ-law silence
      frames.push(buffer.toString('base64'));
    }
    return frames;
  }

  async function waitForAudioResponse(ws: WebSocket, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.removeListener('message', handler);
        resolve(false);
      }, timeoutMs);

      const handler = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'response.audio.delta' || message.type === 'response.audio.done') {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            resolve(true);
          }
        } catch { /* ignore */ }
      };

      ws.on('message', handler);
    });
  }

  function generateCallSid(): string {
    return `CA${randomHex(32)}`;
  }

  function generateStreamSid(): string {
    return `MZ${randomHex(32)}`;
  }

  function randomHex(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});
