import { logger } from '../logger.js';
import { voiceRedis } from '../voice/redis.client.js';
import { RealtimeEventManager } from './realtime.events.js';
import { forEachKey } from '../redis-scan.js';

export interface AnalyticsEvent {
  sessionId: string;
  tenantId: string;
  callSid: string;
  eventType: 'call_start' | 'call_end' | 'turn_start' | 'turn_end' | 'tool_call' | 'error' | 'interruption';
  timestamp: Date;
  data: Record<string, any>;
}

export interface ConversationAnalytics {
  sessionId: string;
  tenantId: string;
  callSid: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  turnCount: number;
  interruptionCount: number;
  toolCallCount: number;
  averageTurnLatency: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  primaryIntent?: string;
  outcome: 'completed' | 'transferred' | 'failed';
  customerSatisfaction?: number;
  resolutionAchieved: boolean;
  topics: string[];
  transcriptLength: number;
  tokensUsed: number;
}

export interface TenantAnalytics {
  tenantId: string;
  period: 'hour' | 'day' | 'week' | 'month';
  totalCalls: number;
  totalDuration: number;
  averageCallDuration: number;
  completionRate: number;
  averageTurnLatency: number;
  averageSentiment: number;
  topIntents: Array<{ intent: string; count: number }>;
  toolUsageStats: Record<string, number>;
  errorRate: number;
  customerSatisfaction: number;
  periodStart: Date;
  periodEnd: Date;
}

export class RealtimeAnalyticsManager {
  private readonly eventManager: RealtimeEventManager;
  private readonly ANALYTICS_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

  constructor(eventManager: RealtimeEventManager) {
    this.eventManager = eventManager;
  }

  async trackEvent(event: AnalyticsEvent): Promise<void> {
    const key = `realtime:analytics:${event.sessionId}:${event.eventType}:${Date.now()}`;
    const value = JSON.stringify(event);

    try {
      await voiceRedis.setex(key, this.ANALYTICS_TTL, value);
      
      // Also update tenant analytics
      await this.updateTenantAnalytics(event);
      
      logger.debug('REALTIME_ANALYTICS_EVENT_TRACKED', {
        sessionId: event.sessionId,
        tenantId: event.tenantId,
        eventType: event.eventType,
        timestamp: event.timestamp,
      });
    } catch (error) {
      logger.error('REALTIME_ANALYTICS_EVENT_ERROR', {
        sessionId: event.sessionId,
        tenantId: event.tenantId,
        eventType: event.eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async saveConversationAnalytics(analytics: ConversationAnalytics): Promise<void> {
    const key = `realtime:conversation:${analytics.sessionId}`;
    const value = JSON.stringify(analytics);

    try {
      await voiceRedis.setex(key, this.ANALYTICS_TTL, value);
      
      // Store in tenant's analytics timeline
      const tenantTimelineKey = `realtime:timeline:${analytics.tenantId}`;
      await voiceRedis.zadd(tenantTimelineKey, analytics.startTime.getTime(), value);
      await voiceRedis.expire(tenantTimelineKey, this.ANALYTICS_TTL);
      
      // Keep only last 1000 conversations in timeline
      await voiceRedis.zremrangebyrank(tenantTimelineKey, 0, -1001);

      logger.info('REALTIME_CONVERSATION_ANALYTICS_SAVED', {
        sessionId: analytics.sessionId,
        tenantId: analytics.tenantId,
        callSid: analytics.callSid,
        duration: analytics.duration,
        outcome: analytics.outcome,
        completionRate: analytics.resolutionAchieved ? 1 : 0,
      });
    } catch (error) {
      logger.error('REALTIME_ANALYTICS_SAVE_ERROR', {
        sessionId: analytics.sessionId,
        tenantId: analytics.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getConversationAnalytics(sessionId: string): Promise<ConversationAnalytics | null> {
    const key = `realtime:conversation:${sessionId}`;
    
    try {
      const value = await voiceRedis.get(key);
      if (!value) return null;

      const analytics: ConversationAnalytics = JSON.parse(value);
      return analytics;
    } catch (error) {
      logger.error('REALTIME_ANALYTICS_RETRIEVE_ERROR', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getTenantAnalytics(
    tenantId: string,
    period: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<TenantAnalytics | null> {
    const now = new Date();
    const periodStart = this.getPeriodStart(now, period);
    const periodEnd = now;

    const timelineKey = `realtime:timeline:${tenantId}`;
    
    try {
      // Get conversations within the period
      const minScore = periodStart.getTime();
      const maxScore = periodEnd.getTime();
      const values = await voiceRedis.zrangebyscore(timelineKey, minScore, maxScore);

      const conversations: ConversationAnalytics[] = values.map(value => JSON.parse(value));
      
      if (conversations.length === 0) {
        return this.createEmptyAnalytics(tenantId, period, periodStart, periodEnd);
      }

      return this.aggregateAnalytics(tenantId, conversations, period, periodStart, periodEnd);
    } catch (error) {
      logger.error('REALTIME_TENANT_ANALYTICS_ERROR', {
        tenantId,
        period,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getRealTimeStats(tenantId: string): Promise<{
    activeCalls: number;
    averageLatency: number;
    currentHourCalls: number;
    errorRate: number;
  }> {
    try {
      // Get active calls from session manager metrics
      const activeCalls = this.eventManager.getActiveSessionCount();
      
      // Get current hour's calls
      const hourStart = this.getPeriodStart(new Date(), 'hour');
      const timelineKey = `realtime:timeline:${tenantId}`;
      const hourValues = await voiceRedis.zrangebyscore(
        timelineKey, 
        hourStart.getTime(), 
        Date.now()
      );
      
      const hourConversations = hourValues.map(value => JSON.parse(value));
      const currentHourCalls = hourConversations.length;
      
      // Calculate average latency for recent calls
      const recentConversations = hourConversations.slice(-10);
      const averageLatency = recentConversations.length > 0
        ? recentConversations.reduce((sum, conv) => sum + (conv.averageTurnLatency || 0), 0) / recentConversations.length
        : 0;
      
      // Calculate error rate
      const errorCount = hourConversations.filter(conv => conv.outcome === 'failed').length;
      const errorRate = currentHourCalls > 0 ? (errorCount / currentHourCalls) * 100 : 0;

      return {
        activeCalls,
        averageLatency: Math.round(averageLatency),
        currentHourCalls,
        errorRate: Math.round(errorRate * 100) / 100,
      };
    } catch (error) {
      logger.error('REALTIME_STATS_ERROR', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        activeCalls: 0,
        averageLatency: 0,
        currentHourCalls: 0,
        errorRate: 0,
      };
    }
  }

  private async updateTenantAnalytics(event: AnalyticsEvent): Promise<void> {
    const tenantStatsKey = `realtime:stats:${event.tenantId}`;
    
    try {
      // Update daily counters
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = `${tenantStatsKey}:${today}`;
      
      const updates: Record<string, number> = {};
      
      switch (event.eventType) {
        case 'call_start':
          updates.calls = 1;
          break;
        case 'call_end':
          if (event.data?.duration) {
            updates.totalDuration = event.data.duration;
          }
          if (event.data?.outcome === 'completed') {
            updates.completedCalls = 1;
          }
          break;
        case 'turn_end':
          if (event.data?.latency) {
            updates.totalLatency = event.data.latency;
            updates.turnCount = 1;
          }
          break;
        case 'tool_call':
          updates.toolCalls = 1;
          break;
        case 'error':
          updates.errors = 1;
          break;
        case 'interruption':
          updates.interruptions = 1;
          break;
      }

      // Apply updates using Redis HINCRBY
      for (const [field, increment] of Object.entries(updates)) {
        await voiceRedis.hincrby(dailyKey, field, increment);
        await voiceRedis.expire(dailyKey, this.ANALYTICS_TTL);
      }
    } catch (error) {
      logger.error('REALTIME_TENANT_STATS_UPDATE_ERROR', {
        tenantId: event.tenantId,
        eventType: event.eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getPeriodStart(date: Date, period: 'hour' | 'day' | 'week' | 'month'): Date {
    const start = new Date(date);
    
    switch (period) {
      case 'hour':
        start.setMinutes(0, 0, 0);
        break;
      case 'day':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case 'month':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
    }
    
    return start;
  }

  private createEmptyAnalytics(
    tenantId: string,
    period: 'hour' | 'day' | 'week' | 'month',
    periodStart: Date,
    periodEnd: Date
  ): TenantAnalytics {
    return {
      tenantId,
      period,
      totalCalls: 0,
      totalDuration: 0,
      averageCallDuration: 0,
      completionRate: 0,
      averageTurnLatency: 0,
      averageSentiment: 0,
      topIntents: [],
      toolUsageStats: {},
      errorRate: 0,
      customerSatisfaction: 0,
      periodStart,
      periodEnd,
    };
  }

  private aggregateAnalytics(
    tenantId: string,
    conversations: ConversationAnalytics[],
    period: 'hour' | 'day' | 'week' | 'month',
    periodStart: Date,
    periodEnd: Date
  ): TenantAnalytics {
    const totalCalls = conversations.length;
    const totalDuration = conversations.reduce((sum, conv) => sum + (conv.duration || 0), 0);
    const averageCallDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    
    const completedCalls = conversations.filter(conv => conv.outcome === 'completed').length;
    const completionRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;
    
    const totalLatency = conversations.reduce((sum, conv) => sum + (conv.averageTurnLatency || 0), 0);
    const averageTurnLatency = totalCalls > 0 ? totalLatency / totalCalls : 0;
    
    const sentimentValues = conversations.map(conv => 
      conv.sentiment === 'positive' ? 1 : conv.sentiment === 'negative' ? -1 : 0
    );
    const averageSentiment = sentimentValues.length > 0 
      ? sentimentValues.reduce((sum, val) => sum + val, 0) / sentimentValues.length 
      : 0;

    // Aggregate intents
    const intentCounts: Record<string, number> = {};
    conversations.forEach(conv => {
      if (conv.primaryIntent) {
        intentCounts[conv.primaryIntent] = (intentCounts[conv.primaryIntent] || 0) + 1;
      }
    });
    
    const topIntents = Object.entries(intentCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([intent, count]) => ({ intent, count }));

    // Aggregate tool usage
    const toolUsageStats: Record<string, number> = {};
    conversations.forEach((_conv) => {
      // This would need to be tracked during the conversation
      // For now, using placeholder data
    });

    const errorCount = conversations.filter(conv => conv.outcome === 'failed').length;
    const errorRate = totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0;

    const satisfactionScores = conversations
      .map(conv => conv.customerSatisfaction)
      .filter(score => score !== undefined) as number[];
    const customerSatisfaction = satisfactionScores.length > 0
      ? satisfactionScores.reduce((sum, score) => sum + score, 0) / satisfactionScores.length
      : 0;

    return {
      tenantId,
      period,
      totalCalls,
      totalDuration,
      averageCallDuration: Math.round(averageCallDuration),
      completionRate: Math.round(completionRate * 100) / 100,
      averageTurnLatency: Math.round(averageTurnLatency),
      averageSentiment: Math.round(averageSentiment * 100) / 100,
      topIntents,
      toolUsageStats,
      errorRate: Math.round(errorRate * 100) / 100,
      customerSatisfaction: Math.round(customerSatisfaction * 100) / 100,
      periodStart,
      periodEnd,
    };
  }

  async cleanupOldAnalytics(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep 30 days
    const pattern = 'realtime:timeline:*';

    try {
      let keysProcessed = 0;
      
      const { durationMs } = await forEachKey(pattern, async (key) => {
        await voiceRedis.zremrangebyscore(key, 0, cutoffDate.getTime());
        keysProcessed++;
      }, { batchSize: 100, timeoutMs: 15000 });

      if (keysProcessed > 0) {
        logger.info('REALTIME_ANALYTICS_CLEANUP', {
          cutoffDate: cutoffDate.toISOString(),
          keysProcessed,
          durationMs,
        });
      }
    } catch (error) {
      logger.error('REALTIME_ANALYTICS_CLEANUP_ERROR', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
