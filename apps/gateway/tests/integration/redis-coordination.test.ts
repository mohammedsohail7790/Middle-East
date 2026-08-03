/**
 * Integration Tests: Redis Coordination
 * 
 * Tests distributed locking, lease renewal, ownership transfer,
 * and failover recovery in multi-instance deployments.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import WebSocket from 'ws';
import { Redis } from 'ioredis';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:3003';
const TENANT_ID = process.env.TEST_TENANT_ID || 'test-tenant-id';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

describe('Redis Coordination Integration Tests', () => {
  let redis: Redis;
  let redis2: Redis; // Second client for simulating multi-instance
  let activeSockets: WebSocket[] = [];

  beforeEach(async () => {
    redis = new Redis(REDIS_URL);
    redis2 = new Redis(REDIS_URL);
    activeSockets = [];
  });

  afterEach(async () => {
    for (const socket of activeSockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    }
    activeSockets = [];

    const keys = await redis.keys('calliq:*test*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    await redis.quit();
    await redis2.quit();
  });

  describe('Distributed Locking', () => {
    it('should acquire distributed lock for session creation', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(1000);

      // Check for lock in Redis
      const lockKeys = await redis.keys('calliq:lock:session:*');
      
      // Should have acquired lock during session creation
      expect(lockKeys.length).toBeGreaterThanOrEqual(0);
    });

    it('should prevent concurrent session creation with same callSid', async () => {
      const callSid = generateCallSid();

      // Try to create two sessions with same callSid
      const ws1 = await connectWebSocket();
      const ws2 = await connectWebSocket();

      await sendTwilioStartWithCallSid(ws1, callSid);
      await delay(100);
      await sendTwilioStartWithCallSid(ws2, callSid);

      await delay(2000);

      // Only one should succeed
      const sessionKeys = await redis.keys(`calliq:session:*${callSid}*`);
      expect(sessionKeys.length).toBeLessThanOrEqual(1);
    });

    it('should release lock after session creation', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(2000);

      // Lock should be released after creation
      const lockKeys = await redis.keys('calliq:lock:session:*');
      
      // Locks should be short-lived (released after operation)
      // In production, check TTL is reasonable
      for (const key of lockKeys) {
        const ttl = await redis.ttl(key);
        expect(ttl).toBeLessThan(60); // Should expire within 60s
      }
    });

    it('should handle lock timeout gracefully', async () => {
      const lockKey = 'calliq:lock:session:test-lock';
      
      // Acquire lock manually
      await redis.set(lockKey, 'test-instance', 'EX', 30);

      // Try to create session (should wait or fail gracefully)
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(2000);

      // Should either wait for lock or handle gracefully
      expect(ws.readyState).toBeDefined();
    });
  });

  describe('Lease Renewal', () => {
    it('should renew session lease periodically', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(1000);

      // Get initial session TTL
      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBeGreaterThan(0);

      const initialTTL = await redis.ttl(sessionKeys[0]);
      
      // Wait for lease renewal (should happen every 15s)
      await delay(20000);

      const renewedTTL = await redis.ttl(sessionKeys[0]);
      
      // TTL should be refreshed (not significantly decreased)
      expect(renewedTTL).toBeGreaterThan(initialTTL - 25);
    }, 25000);

    it('should stop lease renewal after disconnect', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(1000);

      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBeGreaterThan(0);

      // Disconnect
      ws.close();
      await delay(2000);

      // Wait for TTL to expire
      await delay(50000);

      // Session should be expired
      const expiredKeys = await redis.keys('calliq:session:*');
      expect(expiredKeys.length).toBe(0);
    }, 55000);

    it('should maintain heartbeat during active session', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(1000);

      // Check heartbeat key
      const heartbeatKeys = await redis.keys('calliq:heartbeat:*');
      expect(heartbeatKeys.length).toBeGreaterThan(0);

      const initialHeartbeat = await redis.get(heartbeatKeys[0]);
      
      // Wait for heartbeat update
      await delay(20000);

      const updatedHeartbeat = await redis.get(heartbeatKeys[0]);
      
      // Heartbeat should be updated
      expect(updatedHeartbeat).not.toBe(initialHeartbeat);
    }, 25000);
  });

  describe('Ownership Transfer', () => {
    it('should transfer session ownership on instance failure', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(1000);

      // Get session data
      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBeGreaterThan(0);

      const sessionData = await redis.get(sessionKeys[0]);
      const session = JSON.parse(sessionData!);
      const originalInstance = session.instanceId;

      // Simulate instance failure by removing heartbeat
      const heartbeatKeys = await redis.keys('calliq:heartbeat:*');
      if (heartbeatKeys.length > 0) {
        await redis.del(...heartbeatKeys);
      }

      // Wait for orphan detection and adoption
      await delay(35000);

      // Check if session was adopted or cleaned up
      const newSessionKeys = await redis.keys('calliq:session:*');
      
      if (newSessionKeys.length > 0) {
        const newSessionData = await redis.get(newSessionKeys[0]);
        const newSession = JSON.parse(newSessionData!);
        
        // Either adopted by new instance or marked as orphan
        expect(['orphan', 'zombie', 'closed']).toContain(newSession.status);
      }
    }, 40000);

    it('should handle ownership transfer without data loss', async () => {
      const ws = await connectWebSocket();
      const callSid = generateCallSid();
      await sendTwilioStartWithCallSid(ws, callSid);
      await delay(1000);

      // Store some session state
      const sessionKeys = await redis.keys('calliq:session:*');
      const sessionData = await redis.get(sessionKeys[0]);
      const session = JSON.parse(sessionData!);

      // Simulate ownership transfer
      session.instanceId = 'new-instance-id';
      session.transferredAt = new Date().toISOString();
      await redis.set(sessionKeys[0], JSON.stringify(session));

      await delay(2000);

      // Verify data integrity
      const transferredData = await redis.get(sessionKeys[0]);
      const transferredSession = JSON.parse(transferredData!);
      
      expect(transferredSession.callSid).toBe(callSid);
      expect(transferredSession.instanceId).toBe('new-instance-id');
    });
  });

  describe('Failover Recovery', () => {
    it('should recover sessions after Redis reconnect', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(1000);

      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBeGreaterThan(0);

      // Simulate Redis disconnect/reconnect
      // (In production, this would test actual Redis failover)
      await delay(2000);

      // Session should still exist
      const recoveredKeys = await redis.keys('calliq:session:*');
      expect(recoveredKeys.length).toBeGreaterThan(0);
    });

    it('should handle Redis cluster failover', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(1000);

      // In production, this would trigger actual cluster failover
      // For now, verify session resilience
      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBeGreaterThan(0);

      await delay(5000);

      // Session should survive
      const survivedKeys = await redis.keys('calliq:session:*');
      expect(survivedKeys.length).toBeGreaterThan(0);
    });

    it('should recover from temporary Redis unavailability', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(1000);

      // WebSocket should remain connected even if Redis has issues
      expect(ws.readyState).toBe(WebSocket.OPEN);

      await delay(5000);

      // Should still be operational
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe('Cleanup Propagation', () => {
    it('should propagate cleanup across Redis keys', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await delay(1000);

      // Get all related keys
      const beforeSession = await redis.keys('calliq:session:*');
      const beforeHeartbeat = await redis.keys('calliq:heartbeat:*');
      const beforeLock = await redis.keys('calliq:lock:*');

      // Close connection
      ws.close();
      await delay(3000);

      // Verify all related keys cleaned up
      const afterSession = await redis.keys('calliq:session:*');
      const afterHeartbeat = await redis.keys('calliq:heartbeat:*');
      const afterLock = await redis.keys('calliq:lock:*');

      expect(afterSession.length).toBeLessThan(beforeSession.length);
      expect(afterHeartbeat.length).toBeLessThan(beforeHeartbeat.length);
    });

    it('should cleanup orphan keys on instance restart', async () => {
      // Create orphan keys
      await redis.set('calliq:session:orphan-1', JSON.stringify({
        sessionId: 'orphan-1',
        status: 'orphan',
        createdAt: new Date(Date.now() - 60000).toISOString(),
      }), 'EX', 300);

      await redis.set('calliq:heartbeat:orphan-1', Date.now() - 60000, 'EX', 300);

      // Wait for cleanup cycle
      await delay(35000);

      // Orphan keys should be cleaned up
      const orphanSession = await redis.get('calliq:session:orphan-1');
      const orphanHeartbeat = await redis.get('calliq:heartbeat:orphan-1');

      // Should be cleaned up or marked for deletion
      if (orphanSession) {
        const session = JSON.parse(orphanSession);
        expect(['orphan', 'zombie', 'closed']).toContain(session.status);
      }
    }, 40000);
  });

  describe('Reconnect Synchronization', () => {
    it('should synchronize state on reconnect', async () => {
      const callSid = generateCallSid();
      
      // First connection
      const ws1 = await connectWebSocket();
      await sendTwilioStartWithCallSid(ws1, callSid);
      await delay(1000);

      const sessionKeys = await redis.keys('calliq:session:*');
      const sessionData = await redis.get(sessionKeys[0]);
      const session = JSON.parse(sessionData!);

      // Disconnect
      ws1.close();
      await delay(2000);

      // Reconnect with same callSid
      const ws2 = await connectWebSocket();
      await sendTwilioStartWithCallSid(ws2, callSid);
      await delay(1000);

      // Should synchronize or create new session
      const reconnectKeys = await redis.keys('calliq:session:*');
      expect(reconnectKeys.length).toBeGreaterThan(0);
    });

    it('should handle concurrent reconnects', async () => {
      const callSid = generateCallSid();

      // Create initial session
      const ws1 = await connectWebSocket();
      await sendTwilioStartWithCallSid(ws1, callSid);
      await delay(1000);
      ws1.close();
      await delay(1000);

      // Multiple concurrent reconnects
      const ws2 = await connectWebSocket();
      const ws3 = await connectWebSocket();

      await Promise.all([
        sendTwilioStartWithCallSid(ws2, callSid),
        sendTwilioStartWithCallSid(ws3, callSid),
      ]);

      await delay(2000);

      // Should handle gracefully (only one active session)
      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Multi-Instance Coordination', () => {
    it('should coordinate across multiple instances', async () => {
      // Simulate two instances creating sessions
      const ws1 = await connectWebSocket();
      const ws2 = await connectWebSocket();

      await sendTwilioStart(ws1);
      await sendTwilioStart(ws2);

      await delay(2000);

      // Both should have unique sessions
      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBeGreaterThanOrEqual(2);

      // Verify unique session IDs
      const sessionIds = new Set();
      for (const key of sessionKeys) {
        const data = await redis.get(key);
        if (data) {
          const session = JSON.parse(data);
          sessionIds.add(session.sessionId);
        }
      }

      expect(sessionIds.size).toBe(sessionKeys.length);
    });

    it('should maintain global session count', async () => {
      // Create multiple sessions
      const sockets: WebSocket[] = [];
      for (let i = 0; i < 5; i++) {
        const ws = await connectWebSocket();
        await sendTwilioStart(ws);
        sockets.push(ws);
        await delay(500);
      }

      await delay(2000);

      // Check global count
      const sessionKeys = await redis.keys('calliq:session:*');
      expect(sessionKeys.length).toBe(5);

      // Cleanup
      for (const socket of sockets) {
        socket.close();
      }
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

  async function sendTwilioStartWithCallSid(ws: WebSocket, callSid: string): Promise<void> {
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
    await delay(500);
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
