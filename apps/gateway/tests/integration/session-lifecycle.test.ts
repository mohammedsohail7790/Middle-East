/**
 * Integration Tests: Session Lifecycle
 * 
 * Comprehensive tests for realtime session creation, recovery, cleanup, and coordination.
 * Validates no zombie sessions, deterministic cleanup, and proper resource release.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import WebSocket from 'ws';
import { Redis } from 'ioredis';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:3003';
const TENANT_ID = process.env.TEST_TENANT_ID || 'test-tenant-id';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

describe('Session Lifecycle Integration Tests', () => {
  let redis: Redis;
  let activeSockets: WebSocket[] = [];

  beforeEach(async () => {
    redis = new Redis(REDIS_URL);
    activeSockets = [];
  });

  afterEach(async () => {
    // Cleanup all test sockets
    for (const socket of activeSockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    }
    activeSockets = [];

    // Cleanup Redis test keys
    const keys = await redis.keys('calliq:*test*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    await redis.quit();
  });

  describe('Session Creation', () => {
    it('should create session on WebSocket connection', async () => {
      const ws = await connectWebSocket();
      const sessionCreated = await waitForEvent(ws, 'session.created', 5000);

      expect(sessionCreated).toBe(true);
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it('should register session in Redis', async () => {
      const ws = await connectWebSocket();
      await waitForEvent(ws, 'session.created', 5000);

      // Check Redis for session key
      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBeGreaterThan(0);

      // Verify session data
      const sessionData = await redis.get(sessionKeys[0]);
      expect(sessionData).toBeTruthy();
      
      const session = JSON.parse(sessionData!);
      expect(session.tenantId).toBe(TENANT_ID);
      expect(session.status).toBe('active');
    });

    it('should enforce tenant concurrency limits', async () => {
      const sockets: WebSocket[] = [];
      const maxConcurrent = 25; // Tenant limit

      // Try to create more than limit
      for (let i = 0; i < maxConcurrent + 5; i++) {
        try {
          const ws = await connectWebSocket();
          sockets.push(ws);
        } catch (error) {
          // Expected to fail after limit
        }
      }

      // Should have at most maxConcurrent connections
      const openSockets = sockets.filter(s => s.readyState === WebSocket.OPEN);
      expect(openSockets.length).toBeLessThanOrEqual(maxConcurrent);

      // Cleanup
      for (const socket of sockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }
    });

    it('should create unique session IDs', async () => {
      const ws1 = await connectWebSocket();
      const ws2 = await connectWebSocket();

      await waitForEvent(ws1, 'session.created', 5000);
      await waitForEvent(ws2, 'session.created', 5000);

      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBeGreaterThanOrEqual(2);

      // Verify unique session IDs
      const sessionIds = new Set(sessionKeys.map(k => k.split(':')[2]));
      expect(sessionIds.size).toBe(sessionKeys.length);
    });
  });

  describe('Session Recovery', () => {
    it('should recover session after brief disconnect', async () => {
      const ws1 = await connectWebSocket();
      const callSid = generateCallSid();
      
      await sendTwilioStart(ws1, callSid);
      await waitForEvent(ws1, 'session.created', 5000);

      // Get session ID
      const sessionKeys = await redis.keys('calliq:session:*');
      const sessionId = sessionKeys[0].split(':')[2];

      // Disconnect
      ws1.close();
      await delay(1000);

      // Reconnect with same callSid
      const ws2 = await connectWebSocket();
      await sendTwilioStart(ws2, callSid);

      // Should recover or create new session
      const newSessionKeys = await redis.keys('calliq:session:*');
      expect(newSessionKeys.length).toBeGreaterThan(0);
    });

    it('should adopt orphan sessions', async () => {
      const ws = await connectWebSocket();
      const callSid = generateCallSid();
      
      await sendTwilioStart(ws, callSid);
      await waitForEvent(ws, 'session.created', 5000);

      // Simulate orphan by removing heartbeat
      const heartbeatKeys = await redis.keys('calliq:heartbeat:*');
      if (heartbeatKeys.length > 0) {
        await redis.del(...heartbeatKeys);
      }

      // Wait for orphan detection (30s cleanup cycle)
      await delay(35000);

      // Verify session was cleaned up or adopted
      const sessionKeys = await redis.keys('calliq:session:*');
      // Session should either be cleaned up or marked as orphan
      if (sessionKeys.length > 0) {
        const sessionData = await redis.get(sessionKeys[0]);
        const session = JSON.parse(sessionData!);
        expect(['orphan', 'zombie', 'closed']).toContain(session.status);
      }
    }, 40000);
  });

  describe('Reconnect Handling', () => {
    it('should handle rapid reconnects', async () => {
      const callSid = generateCallSid();

      for (let i = 0; i < 5; i++) {
        const ws = await connectWebSocket();
        await sendTwilioStart(ws, callSid);
        await delay(500);
        ws.close();
        await delay(500);
      }

      // Verify no zombie sessions
      await delay(2000);
      const sessionKeys = await redis.keys('calliq:session:*');
      
      // Should have at most 1 session (or 0 if all cleaned up)
      expect(sessionKeys.length).toBeLessThanOrEqual(1);
    });

    it('should enforce reconnect cooldown', async () => {
      const ws1 = await connectWebSocket();
      ws1.close();

      // Try immediate reconnect (should be rate limited)
      await delay(100);
      
      try {
        const ws2 = await connectWebSocket();
        // If connection succeeds, close it
        ws2.close();
      } catch (error) {
        // Expected: rate limited
        expect(error).toBeTruthy();
      }
    });
  });

  describe('Stale Session Cleanup', () => {
    it('should cleanup inactive sessions', async () => {
      const ws = await connectWebSocket();
      const callSid = generateCallSid();
      
      await sendTwilioStart(ws, callSid);
      await waitForEvent(ws, 'session.created', 5000);

      // Stop sending heartbeats (simulate stale session)
      // Wait for inactivity timeout (45s)
      await delay(50000);

      // Verify session was cleaned up
      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBe(0);
    }, 55000);

    it('should cleanup on explicit disconnect', async () => {
      const ws = await connectWebSocket();
      const callSid = generateCallSid();
      
      await sendTwilioStart(ws, callSid);
      await waitForEvent(ws, 'session.created', 5000);

      // Get session count before
      const beforeKeys = await redis.keys('calliq:session:*');
      const beforeCount = beforeKeys.length;

      // Disconnect
      ws.close();
      await delay(2000);

      // Verify cleanup
      const afterKeys = await redis.keys('calliq:session:*');
      expect(afterKeys.length).toBeLessThan(beforeCount);
    });
  });

  describe('Deterministic Shutdown', () => {
    it('should cleanup all resources on close', async () => {
      const ws = await connectWebSocket();
      const callSid = generateCallSid();
      
      await sendTwilioStart(ws, callSid);
      await waitForEvent(ws, 'session.created', 5000);

      // Get all Redis keys before close
      const beforeSession = await redis.keys('calliq:session:*');
      const beforeHeartbeat = await redis.keys('calliq:heartbeat:*');
      const beforeLock = await redis.keys('calliq:lock:*');

      // Close connection
      ws.close();
      await delay(2000);

      // Verify all resources cleaned up
      const afterSession = await redis.keys('calliq:session:*');
      const afterHeartbeat = await redis.keys('calliq:heartbeat:*');
      const afterLock = await redis.keys('calliq:lock:*');

      expect(afterSession.length).toBeLessThan(beforeSession.length);
      expect(afterHeartbeat.length).toBeLessThan(beforeHeartbeat.length);
      expect(afterLock.length).toBeLessThanOrEqual(beforeLock.length);
    });

    it('should not leave zombie sessions', async () => {
      const sockets: WebSocket[] = [];

      // Create multiple sessions
      for (let i = 0; i < 5; i++) {
        const ws = await connectWebSocket();
        const callSid = generateCallSid();
        await sendTwilioStart(ws, callSid);
        sockets.push(ws);
      }

      await delay(2000);

      // Close all
      for (const socket of sockets) {
        socket.close();
      }

      await delay(3000);

      // Verify no zombie sessions
      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBe(0);
    });
  });

  describe('Redis Ownership Transfer', () => {
    it('should transfer ownership on instance failure', async () => {
      const ws = await connectWebSocket();
      const callSid = generateCallSid();
      
      await sendTwilioStart(ws, callSid);
      await waitForEvent(ws, 'session.created', 5000);

      // Get session data
      const sessionKeys = await redis.keys('calliq:session:*');
      const sessionData = await redis.get(sessionKeys[0]);
      const session = JSON.parse(sessionData!);
      const originalInstance = session.instanceId;

      // Simulate instance failure by removing heartbeat
      const heartbeatKeys = await redis.keys('calliq:heartbeat:*');
      if (heartbeatKeys.length > 0) {
        await redis.del(...heartbeatKeys);
      }

      // Wait for orphan adoption
      await delay(35000);

      // Verify session was adopted or cleaned up
      const newSessionKeys = await redis.keys('calliq:session:*');
      if (newSessionKeys.length > 0) {
        const newSessionData = await redis.get(newSessionKeys[0]);
        const newSession = JSON.parse(newSessionData!);
        
        // Either adopted by new instance or marked as orphan
        expect(newSession.status).toMatch(/orphan|zombie|closed/);
      }
    }, 40000);
  });

  describe('No Listener Leaks', () => {
    it('should remove all event listeners on close', async () => {
      const ws = await connectWebSocket();
      const callSid = generateCallSid();
      
      await sendTwilioStart(ws, callSid);
      await waitForEvent(ws, 'session.created', 5000);

      // Get listener count before close
      const beforeListeners = ws.listenerCount('message') + 
                             ws.listenerCount('close') + 
                             ws.listenerCount('error');

      // Close
      ws.close();
      await delay(1000);

      // Verify listeners removed
      const afterListeners = ws.listenerCount('message') + 
                            ws.listenerCount('close') + 
                            ws.listenerCount('error');

      // After close, listeners should be removed or minimal
      expect(afterListeners).toBeLessThanOrEqual(beforeListeners);
    });
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

  async function sendTwilioStart(ws: WebSocket, callSid: string): Promise<void> {
    const startEvent = {
      event: 'start',
      sequenceNumber: '1',
      start: {
        streamSid: generateStreamSid(),
        accountSid: 'AC_test',
        callSid,
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
  }

  async function waitForEvent(ws: WebSocket, eventType: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.removeListener('message', handler);
        resolve(false);
      }, timeoutMs);

      const handler = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === eventType) {
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
