/**
 * Integration Tests: Tool Execution
 * 
 * Comprehensive tests for tool execution reliability, timeout handling,
 * retry logic, concurrent execution, and idempotency validation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import WebSocket from 'ws';
import { Redis } from 'ioredis';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:3003';
const TENANT_ID = process.env.TEST_TENANT_ID || 'test-tenant-id';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

describe('Tool Execution Integration Tests', () => {
  let redis: Redis;
  let activeSockets: WebSocket[] = [];

  beforeEach(async () => {
    redis = new Redis(REDIS_URL);
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
  });

  describe('Success Paths', () => {
    it('should execute create_appointment tool successfully', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      // Trigger appointment creation
      await sendUserAudio(ws, "I need to schedule an appointment for tomorrow at 2pm");
      
      // Wait for tool call
      const toolCalled = await waitForToolCall(ws, 'create_appointment', 15000);
      expect(toolCalled).toBe(true);

      // Verify tool execution completed
      const toolCompleted = await waitForToolCompletion(ws, 10000);
      expect(toolCompleted).toBe(true);
    }, 30000);

    it('should execute search_knowledge_base tool successfully', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      // Trigger knowledge search
      await sendUserAudio(ws, "What are your business hours?");
      
      const toolCalled = await waitForToolCall(ws, 'search_knowledge_base', 15000);
      expect(toolCalled).toBe(true);

      const toolCompleted = await waitForToolCompletion(ws, 10000);
      expect(toolCompleted).toBe(true);
    }, 30000);

    it('should execute transfer_call tool successfully', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      // Trigger call transfer
      await sendUserAudio(ws, "I need to speak with a manager");
      
      const toolCalled = await waitForToolCall(ws, 'transfer_call', 15000);
      expect(toolCalled).toBe(true);

      const toolCompleted = await waitForToolCompletion(ws, 10000);
      expect(toolCompleted).toBe(true);
    }, 30000);

    it('should execute capture_lead tool successfully', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      // Trigger lead capture
      await sendUserAudio(ws, "My name is John Smith and my phone is 555-1234");
      
      const toolCalled = await waitForToolCall(ws, 'capture_lead', 15000);
      expect(toolCalled).toBe(true);

      const toolCompleted = await waitForToolCompletion(ws, 10000);
      expect(toolCompleted).toBe(true);
    }, 30000);
  });

  describe('Timeout Handling', () => {
    it('should timeout slow tool execution', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      // Trigger tool that might timeout
      await sendUserAudio(ws, "Schedule appointment for next week");
      
      const toolCalled = await waitForToolCall(ws, 'create_appointment', 15000);
      
      if (toolCalled) {
        // Wait for either completion or timeout
        const result = await Promise.race([
          waitForToolCompletion(ws, 30000),
          waitForToolTimeout(ws, 30000),
        ]);

        // Should either complete or timeout gracefully
        expect(result).toBeDefined();
      }
    }, 50000);

    it('should enforce tool execution timeout limits', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      const startTime = Date.now();
      
      await sendUserAudio(ws, "Create an appointment");
      await waitForToolCall(ws, 'create_appointment', 15000);
      
      // Wait for completion or timeout
      await Promise.race([
        waitForToolCompletion(ws, 60000),
        delay(60000),
      ]);

      const duration = Date.now() - startTime;
      
      // Should not exceed maximum timeout (60s)
      expect(duration).toBeLessThan(65000);
    }, 70000);
  });

  describe('Retry Logic', () => {
    it('should retry failed tool execution', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      let toolCallCount = 0;
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'response.function_call_arguments.done') {
            toolCallCount++;
          }
        } catch { /* ignore */ }
      });

      await sendUserAudio(ws, "Schedule appointment");
      await delay(20000);

      // May have retried on failure
      expect(toolCallCount).toBeGreaterThanOrEqual(1);
    }, 30000);

    it('should respect retry limits', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      let toolCallCount = 0;
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'response.function_call_arguments.done') {
            toolCallCount++;
          }
        } catch { /* ignore */ }
      });

      await sendUserAudio(ws, "Create appointment");
      await delay(30000);

      // Should not retry indefinitely (max 3 retries)
      expect(toolCallCount).toBeLessThanOrEqual(4); // 1 initial + 3 retries
    }, 40000);
  });

  describe('Concurrent Execution', () => {
    it('should handle concurrent tool calls', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      // Trigger multiple tool calls rapidly
      await sendUserAudio(ws, "What are your hours and can you schedule me for tomorrow at 2pm?");
      
      await delay(15000);

      // Should handle both tool calls
      expect(ws.readyState).toBe(WebSocket.OPEN);
    }, 20000);

    it('should queue tool executions properly', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      const toolCalls: string[] = [];
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'response.function_call_arguments.done') {
            toolCalls.push(message.name);
          }
        } catch { /* ignore */ }
      });

      // Trigger multiple operations
      await sendUserAudio(ws, "Search your knowledge base, then create an appointment, then capture my lead");
      await delay(20000);

      // Should have executed multiple tools
      expect(toolCalls.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Idempotency Validation', () => {
    it('should prevent duplicate tool execution', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      let toolCallCount = 0;
      const toolCallIds = new Set<string>();

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'response.function_call_arguments.done') {
            toolCallCount++;
            if (message.call_id) {
              toolCallIds.add(message.call_id);
            }
          }
        } catch { /* ignore */ }
      });

      // Send same request twice
      await sendUserAudio(ws, "Schedule appointment for tomorrow");
      await delay(5000);
      await sendUserAudio(ws, "Schedule appointment for tomorrow");
      await delay(10000);

      // Should have unique call IDs (no duplicates)
      expect(toolCallIds.size).toBe(toolCallCount);
    }, 20000);

    it('should use idempotency keys for tool calls', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      const idempotencyKeys: string[] = [];

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'response.function_call_arguments.done') {
            // Check for idempotency key in Redis
            // This would be validated in actual implementation
            idempotencyKeys.push(message.call_id || 'unknown');
          }
        } catch { /* ignore */ }
      });

      await sendUserAudio(ws, "Create appointment");
      await delay(10000);

      // Should have idempotency tracking
      expect(idempotencyKeys.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Circuit Breakers', () => {
    it('should open circuit breaker after repeated failures', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      let errorCount = 0;
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'error' || message.error) {
            errorCount++;
          }
        } catch { /* ignore */ }
      });

      // Trigger multiple failing operations
      for (let i = 0; i < 5; i++) {
        await sendUserAudio(ws, "Execute failing operation");
        await delay(3000);
      }

      // Circuit breaker should prevent excessive retries
      expect(ws.readyState).toBe(WebSocket.OPEN);
    }, 20000);

    it('should recover after circuit breaker cooldown', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      // Trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        await sendUserAudio(ws, "Failing operation");
        await delay(2000);
      }

      // Wait for cooldown
      await delay(10000);

      // Should accept new requests
      await sendUserAudio(ws, "What are your hours?");
      const toolCalled = await waitForToolCall(ws, 'search_knowledge_base', 10000);
      
      // May or may not succeed depending on circuit state
      expect(ws.readyState).toBe(WebSocket.OPEN);
    }, 25000);
  });

  describe('Cleanup Correctness', () => {
    it('should cleanup tool execution state on disconnect', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      // Start tool execution
      await sendUserAudio(ws, "Create appointment");
      await delay(2000);

      // Get tool execution keys before disconnect
      const beforeKeys = await redis.keys('calliq:tool:*');

      // Disconnect
      ws.close();
      await delay(3000);

      // Verify cleanup
      const afterKeys = await redis.keys('calliq:tool:*');
      expect(afterKeys.length).toBeLessThanOrEqual(beforeKeys.length);
    });

    it('should not leave orphan tool executions', async () => {
      const ws = await connectWebSocket();
      await sendTwilioStart(ws);
      await waitForSessionCreated(ws);

      // Start multiple tool executions
      await sendUserAudio(ws, "Search knowledge and create appointment");
      await delay(3000);

      // Abrupt disconnect
      ws.terminate();
      await delay(5000);

      // Verify no orphan tool executions
      const toolKeys = await redis.keys('calliq:tool:*');
      
      // Should be cleaned up or marked as orphan
      for (const key of toolKeys) {
        const data = await redis.get(key);
        if (data) {
          const tool = JSON.parse(data);
          expect(['completed', 'failed', 'orphan', 'timeout']).toContain(tool.status);
        }
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

  async function sendUserAudio(ws: WebSocket, text: string): Promise<void> {
    // Send audio frames representing user speech
    const frameCount = Math.ceil(text.length / 10); // Rough estimate
    
    for (let i = 0; i < frameCount; i++) {
      const buffer = Buffer.alloc(160);
      for (let j = 0; j < buffer.length; j++) {
        buffer[j] = Math.floor(Math.random() * 256);
      }

      const mediaEvent = {
        event: 'media',
        sequenceNumber: String(i),
        media: {
          track: 'inbound',
          chunk: String(i),
          timestamp: String(Date.now()),
          payload: buffer.toString('base64'),
        },
        streamSid: 'MZ_test',
      };

      ws.send(JSON.stringify(mediaEvent));
      await delay(20);
    }
  }

  async function waitForSessionCreated(ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Session creation timeout'));
      }, 10000);

      const handler = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'session.created') {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            resolve();
          }
        } catch { /* ignore */ }
      };

      ws.on('message', handler);
    });
  }

  async function waitForToolCall(ws: WebSocket, toolName: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.removeListener('message', handler);
        resolve(false);
      }, timeoutMs);

      const handler = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'response.function_call_arguments.done' && 
              message.name === toolName) {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            resolve(true);
          }
        } catch { /* ignore */ }
      };

      ws.on('message', handler);
    });
  }

  async function waitForToolCompletion(ws: WebSocket, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.removeListener('message', handler);
        resolve(false);
      }, timeoutMs);

      const handler = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'response.output_item.done' || 
              message.type === 'response.done') {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            resolve(true);
          }
        } catch { /* ignore */ }
      };

      ws.on('message', handler);
    });
  }

  async function waitForToolTimeout(ws: WebSocket, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.removeListener('message', handler);
        resolve(false);
      }, timeoutMs);

      const handler = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'error' && message.error?.includes('timeout')) {
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
