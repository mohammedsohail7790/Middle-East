import { logger } from '../logger.js';
import { voiceRedis } from '../voice/redis.client.js';
import { scanKeys, deleteByPattern } from '../redis-scan.js';

export interface MemoryEntry {
  sessionId: string;
  tenantId: string;
  callSid: string;
  type: 'customer_info' | 'conversation_context' | 'intent' | 'entity';
  key: string;
  value: any;
  timestamp: Date;
  expiresAt?: Date;
}

export interface ConversationSummary {
  sessionId: string;
  tenantId: string;
  callSid: string;
  customerName?: string;
  customerPhone?: string;
  primaryIntent?: string;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  outcome: 'completed' | 'transferred' | 'failed';
  duration: number;
  transcript: string;
  summary: string;
  createdAt: Date;
}

export class RealtimeMemoryManager {
  private readonly MEMORY_TTL = 24 * 60 * 60; // 24 hours in seconds
  private readonly SUMMARY_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

  async storeMemory(entry: MemoryEntry): Promise<void> {
    const key = `realtime:memory:${entry.sessionId}:${entry.type}:${entry.key}`;
    const value = JSON.stringify(entry);
    const ttl = entry.expiresAt 
      ? Math.floor((entry.expiresAt.getTime() - Date.now()) / 1000)
      : this.MEMORY_TTL;

    try {
      await voiceRedis.setex(key, ttl, value);
      
      logger.debug('REALTIME_MEMORY_STORED', {
        sessionId: entry.sessionId,
        tenantId: entry.tenantId,
        type: entry.type,
        key: entry.key,
        ttl,
      });
    } catch (error) {
      logger.error('REALTIME_MEMORY_STORE_ERROR', {
        sessionId: entry.sessionId,
        tenantId: entry.tenantId,
        type: entry.type,
        key: entry.key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getMemory(
    sessionId: string, 
    type: string, 
    key: string
  ): Promise<MemoryEntry | null> {
    const redisKey = `realtime:memory:${sessionId}:${type}:${key}`;
    
    try {
      const value = await voiceRedis.get(redisKey);
      if (!value) return null;

      const entry: MemoryEntry = JSON.parse(value);
      return entry;
    } catch (error) {
      logger.error('REALTIME_MEMORY_RETRIEVE_ERROR', {
        sessionId,
        type,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getAllSessionMemory(sessionId: string): Promise<MemoryEntry[]> {
    const pattern = `realtime:memory:${sessionId}:*`;
    
    try {
      const { keys } = await scanKeys({ pattern, batchSize: 50, timeoutMs: 3000 });
      const memories: MemoryEntry[] = [];

      for (const key of keys) {
        const value = await voiceRedis.get(key);
        if (value) {
          const entry: MemoryEntry = JSON.parse(value);
          memories.push(entry);
        }
      }

      return memories.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      logger.error('REALTIME_MEMORY_SESSION_ERROR', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async storeCustomerInfo(
    sessionId: string, 
    tenantId: string, 
    callSid: string,
    name?: string,
    phone?: string,
    email?: string
  ): Promise<void> {
    if (name) {
      await this.storeMemory({
        sessionId,
        tenantId,
        callSid,
        type: 'customer_info',
        key: 'name',
        value: name,
        timestamp: new Date(),
      });
    }

    if (phone) {
      await this.storeMemory({
        sessionId,
        tenantId,
        callSid,
        type: 'customer_info',
        key: 'phone',
        value: phone,
        timestamp: new Date(),
      });
    }

    if (email) {
      await this.storeMemory({
        sessionId,
        tenantId,
        callSid,
        type: 'customer_info',
        key: 'email',
        value: email,
        timestamp: new Date(),
      });
    }
  }

  async storeIntent(
    sessionId: string,
    tenantId: string,
    callSid: string,
    intent: string,
    confidence: number
  ): Promise<void> {
    await this.storeMemory({
      sessionId,
      tenantId,
      callSid,
      type: 'intent',
      key: 'primary',
      value: { intent, confidence },
      timestamp: new Date(),
    });
  }

  async storeEntity(
    sessionId: string,
    tenantId: string,
    callSid: string,
    entityType: string,
    entityValue: string
  ): Promise<void> {
    await this.storeMemory({
      sessionId,
      tenantId,
      callSid,
      type: 'entity',
      key: entityType,
      value: entityValue,
      timestamp: new Date(),
    });
  }

  async storeConversationContext(
    sessionId: string,
    tenantId: string,
    callSid: string,
    context: Record<string, any>
  ): Promise<void> {
    await this.storeMemory({
      sessionId,
      tenantId,
      callSid,
      type: 'conversation_context',
      key: 'current',
      value: context,
      timestamp: new Date(),
    });
  }

  async saveConversationSummary(summary: ConversationSummary): Promise<void> {
    const key = `realtime:summary:${summary.sessionId}`;
    const value = JSON.stringify(summary);

    try {
      await voiceRedis.setex(key, this.SUMMARY_TTL, value);
      
      // Also store in tenant's history
      const tenantHistoryKey = `realtime:history:${summary.tenantId}`;
      await voiceRedis.lpush(tenantHistoryKey, value);
      await voiceRedis.expire(tenantHistoryKey, this.SUMMARY_TTL);
      
      // Limit history to last 100 conversations
      await voiceRedis.ltrim(tenantHistoryKey, 0, 99);

      logger.info('REALTIME_CONVERSATION_SUMMARY_SAVED', {
        sessionId: summary.sessionId,
        tenantId: summary.tenantId,
        callSid: summary.callSid,
        outcome: summary.outcome,
        duration: summary.duration,
      });
    } catch (error) {
      logger.error('REALTIME_SUMMARY_SAVE_ERROR', {
        sessionId: summary.sessionId,
        tenantId: summary.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getConversationSummary(sessionId: string): Promise<ConversationSummary | null> {
    const key = `realtime:summary:${sessionId}`;
    
    try {
      const value = await voiceRedis.get(key);
      if (!value) return null;

      const summary: ConversationSummary = JSON.parse(value);
      return summary;
    } catch (error) {
      logger.error('REALTIME_SUMMARY_RETRIEVE_ERROR', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getTenantConversationHistory(
    tenantId: string, 
    limit = 50
  ): Promise<ConversationSummary[]> {
    const historyKey = `realtime:history:${tenantId}`;
    
    try {
      const values = await voiceRedis.lrange(historyKey, 0, limit - 1);
      const summaries: ConversationSummary[] = [];

      for (const value of values) {
        const summary: ConversationSummary = JSON.parse(value);
        summaries.push(summary);
      }

      return summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      logger.error('REALTIME_TENANT_HISTORY_ERROR', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async clearSessionMemory(sessionId: string): Promise<void> {
    const pattern = `realtime:memory:${sessionId}:*`;
    
    try {
      const { deleted } = await deleteByPattern({ pattern, batchSize: 50 });
      if (deleted > 0) {
        logger.debug('REALTIME_MEMORY_CLEARED', {
          sessionId,
          keysCleared: deleted,
        });
      }
    } catch (error) {
      logger.error('REALTIME_MEMORY_CLEAR_ERROR', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getCustomerHistory(
    tenantId: string,
    phoneNumber: string,
    limit = 10
  ): Promise<ConversationSummary[]> {
    const history = await this.getTenantConversationHistory(tenantId, 200);
    
    return history
      .filter(summary => summary.customerPhone === phoneNumber)
      .slice(0, limit);
  }
}
