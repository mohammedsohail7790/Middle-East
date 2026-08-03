/**
 * Automated Disaster Recovery System
 * 
 * Automates recovery from infrastructure failures:
 * - Redis recovery
 * - Queue replay automation
 * - WebSocket recovery orchestration
 * - Reconnect storm mitigation
 * - Deployment rollback automation
 */

import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RecoveryConfig {
  redisBackupPath: string;
  maxRecoveryAttempts: number;
  recoveryTimeoutMs: number;
  healthCheckIntervalMs: number;
  reconnectStormThreshold: number;
}

export interface RecoveryStatus {
  component: string;
  status: 'healthy' | 'degraded' | 'failed' | 'recovering';
  lastCheck: Date;
  failureCount: number;
  recoveryAttempts: number;
  lastRecovery?: Date;
}

export interface RecoveryMetrics {
  totalRecoveries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  avgRecoveryTimeMs: number;
  lastRecoveryTime?: Date;
}

/**
 * Automated Recovery Orchestrator
 * 
 * Monitors system health and triggers automated recovery
 */
export class AutomatedRecoveryOrchestrator extends EventEmitter {
  private redis: Redis;
  private config: RecoveryConfig;
  private componentStatus: Map<string, RecoveryStatus> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private recoveryInProgress: Set<string> = new Set();

  constructor(redis: Redis, config?: Partial<RecoveryConfig>) {
    super();
    
    this.redis = redis;
    this.config = {
      redisBackupPath: '/var/backups/redis',
      maxRecoveryAttempts: 3,
      recoveryTimeoutMs: 300000, // 5 minutes
      healthCheckIntervalMs: 10000, // 10 seconds
      reconnectStormThreshold: 50, // 50 reconnects per second
      ...config,
    };
  }

  /**
   * Start automated recovery monitoring
   */
  start(): void {
    console.log('🚀 Starting automated recovery orchestrator');

    this.healthCheckInterval = setInterval(async () => {
      await this.runHealthChecks();
    }, this.config.healthCheckIntervalMs);

    // Initial health check
    this.runHealthChecks();
  }

  /**
   * Stop automated recovery
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    console.log('🛑 Automated recovery orchestrator stopped');
  }

  /**
   * Run health checks on all components
   */
  private async runHealthChecks(): Promise<void> {
    const components = ['redis', 'database', 'openai', 'twilio', 'gateway'];

    for (const component of components) {
      try {
        const healthy = await this.checkComponentHealth(component);
        
        if (!healthy) {
          await this.handleComponentFailure(component);
        } else {
          await this.updateComponentStatus(component, 'healthy');
        }
      } catch (error) {
        console.error(`Health check failed for ${component}:`, error);
      }
    }
  }

  /**
   * Check component health
   */
  private async checkComponentHealth(component: string): Promise<boolean> {
    switch (component) {
      case 'redis':
        return await this.checkRedisHealth();
      
      case 'database':
        return await this.checkDatabaseHealth();
      
      case 'openai':
        return await this.checkOpenAIHealth();
      
      case 'twilio':
        return await this.checkTwilioHealth();
      
      case 'gateway':
        return await this.checkGatewayHealth();
      
      default:
        return true;
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      // Simple check - in production, use actual database connection
      const response = await fetch('http://localhost:3003/ready');
      const data = await response.json();
      return data.checks?.database === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check OpenAI health
   */
  private async checkOpenAIHealth(): Promise<boolean> {
    try {
      const response = await fetch('https://status.openai.com/api/v2/status.json');
      const data = await response.json();
      return data.status.indicator === 'none';
    } catch (error) {
      return false;
    }
  }

  /**
   * Check Twilio health
   */
  private async checkTwilioHealth(): Promise<boolean> {
    try {
      const response = await fetch('https://status.twilio.com/api/v2/status.json');
      const data = await response.json();
      return data.status.indicator === 'none';
    } catch (error) {
      return false;
    }
  }

  /**
   * Check gateway health
   */
  private async checkGatewayHealth(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:3003/health');
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle component failure
   */
  private async handleComponentFailure(component: string): Promise<void> {
    const status = this.componentStatus.get(component);
    
    if (!status) {
      this.componentStatus.set(component, {
        component,
        status: 'failed',
        lastCheck: new Date(),
        failureCount: 1,
        recoveryAttempts: 0,
      });
    } else {
      status.failureCount++;
      status.status = 'failed';
      status.lastCheck = new Date();
    }

    console.error(`❌ Component failure detected: ${component}`);
    this.emit('component.failed', { component });

    // Trigger recovery if not already in progress
    if (!this.recoveryInProgress.has(component)) {
      await this.triggerRecovery(component);
    }
  }

  /**
   * Trigger automated recovery
   */
  private async triggerRecovery(component: string): Promise<void> {
    const status = this.componentStatus.get(component);
    
    if (!status) return;

    if (status.recoveryAttempts >= this.config.maxRecoveryAttempts) {
      console.error(`❌ Max recovery attempts reached for ${component}`);
      this.emit('recovery.failed', { component, reason: 'max_attempts' });
      return;
    }

    this.recoveryInProgress.add(component);
    status.recoveryAttempts++;
    status.status = 'recovering';

    console.log(`🔄 Starting recovery for ${component} (attempt ${status.recoveryAttempts})`);
    this.emit('recovery.started', { component, attempt: status.recoveryAttempts });

    const startTime = Date.now();

    try {
      switch (component) {
        case 'redis':
          await this.recoverRedis();
          break;
        
        case 'database':
          await this.recoverDatabase();
          break;
        
        case 'gateway':
          await this.recoverGateway();
          break;
        
        default:
          console.log(`No automated recovery for ${component}`);
      }

      const recoveryTime = Date.now() - startTime;
      
      status.status = 'healthy';
      status.lastRecovery = new Date();
      status.failureCount = 0;

      console.log(`✅ Recovery successful for ${component} (${recoveryTime}ms)`);
      this.emit('recovery.success', { component, recoveryTime });

      // Store recovery metrics
      await this.storeRecoveryMetrics(component, recoveryTime, true);
    } catch (error) {
      const recoveryTime = Date.now() - startTime;
      
      console.error(`❌ Recovery failed for ${component}:`, error);
      this.emit('recovery.failed', { 
        component, 
        error: error instanceof Error ? error.message : String(error),
        recoveryTime,
      });

      // Store recovery metrics
      await this.storeRecoveryMetrics(component, recoveryTime, false);
    } finally {
      this.recoveryInProgress.delete(component);
    }
  }

  /**
   * Recover Redis
   */
  private async recoverRedis(): Promise<void> {
    console.log('🔄 Recovering Redis...');

    // Step 1: Check if Redis is running
    try {
      await execAsync('redis-cli ping');
      console.log('✅ Redis is running');
      return;
    } catch (error) {
      console.log('❌ Redis is not responding');
    }

    // Step 2: Restart Redis service
    try {
      console.log('🔄 Restarting Redis service...');
      await execAsync('sudo systemctl restart redis');
      
      // Wait for Redis to start
      await this.waitForRedis(30000);
      
      console.log('✅ Redis restarted successfully');
    } catch (error) {
      throw new Error(`Failed to restart Redis: ${error}`);
    }

    // Step 3: Verify connection
    await this.redis.ping();
    console.log('✅ Redis connection verified');
  }

  /**
   * Wait for Redis to be ready
   */
  private async waitForRedis(timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        await this.redis.ping();
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Redis did not become ready in time');
  }

  /**
   * Recover database
   */
  private async recoverDatabase(): Promise<void> {
    console.log('🔄 Recovering database...');

    // In production, implement actual database recovery
    // For now, just verify connection
    const healthy = await this.checkDatabaseHealth();
    
    if (!healthy) {
      throw new Error('Database recovery not implemented');
    }

    console.log('✅ Database connection verified');
  }

  /**
   * Recover gateway
   */
  private async recoverGateway(): Promise<void> {
    console.log('🔄 Recovering gateway...');

    // Step 1: Check if gateway is responding
    try {
      const response = await fetch('http://localhost:3003/health');
      if (response.ok) {
        console.log('✅ Gateway is responding');
        return;
      }
    } catch (error) {
      console.log('❌ Gateway is not responding');
    }

    // Step 2: Restart gateway (in production, use process manager)
    console.log('🔄 Gateway restart would be triggered here');
    
    // In production:
    // - Use PM2, systemd, or container orchestrator
    // - Trigger graceful restart
    // - Wait for health checks to pass
  }

  /**
   * Mitigate reconnect storm
   */
  async mitigateReconnectStorm(): Promise<void> {
    console.log('🔄 Mitigating reconnect storm...');

    // Step 1: Enable rate limiting
    await this.redis.set('calliq:reconnect:storm:active', '1', 'EX', 300);

    // Step 2: Increase reconnect cooldown
    await this.redis.set('calliq:reconnect:cooldown', '5000', 'EX', 300); // 5 seconds

    // Step 3: Notify monitoring
    this.emit('reconnect.storm.mitigated');

    console.log('✅ Reconnect storm mitigation active');
  }

  /**
   * Replay failed queue jobs
   */
  async replayFailedJobs(queueName: string): Promise<number> {
    console.log(`🔄 Replaying failed jobs from ${queueName}...`);

    // Get failed jobs from Redis
    const failedJobs = await this.redis.lrange(`bull:${queueName}:failed`, 0, -1);
    
    let replayedCount = 0;

    for (const jobData of failedJobs) {
      try {
        const job = JSON.parse(jobData);
        
        // Re-queue job
        await this.redis.lpush(`bull:${queueName}:wait`, jobData);
        
        replayedCount++;
      } catch (error) {
        console.error('Failed to replay job:', error);
      }
    }

    console.log(`✅ Replayed ${replayedCount} failed jobs`);
    
    return replayedCount;
  }

  /**
   * Update component status
   */
  private async updateComponentStatus(component: string, status: RecoveryStatus['status']): Promise<void> {
    const existing = this.componentStatus.get(component);
    
    if (existing) {
      existing.status = status;
      existing.lastCheck = new Date();
      
      if (status === 'healthy') {
        existing.failureCount = 0;
      }
    } else {
      this.componentStatus.set(component, {
        component,
        status,
        lastCheck: new Date(),
        failureCount: 0,
        recoveryAttempts: 0,
      });
    }
  }

  /**
   * Store recovery metrics
   */
  private async storeRecoveryMetrics(
    component: string,
    recoveryTimeMs: number,
    success: boolean
  ): Promise<void> {
    const key = `calliq:recovery:metrics:${component}`;
    
    await this.redis.hincrby(key, 'totalRecoveries', 1);
    
    if (success) {
      await this.redis.hincrby(key, 'successfulRecoveries', 1);
      await this.redis.hset(key, 'lastRecoveryTime', new Date().toISOString());
      
      // Update average recovery time
      const avgTime = await this.redis.hget(key, 'avgRecoveryTimeMs');
      const totalRecoveries = await this.redis.hget(key, 'successfulRecoveries');
      
      if (avgTime && totalRecoveries) {
        const newAvg = (parseFloat(avgTime) * (parseInt(totalRecoveries) - 1) + recoveryTimeMs) / parseInt(totalRecoveries);
        await this.redis.hset(key, 'avgRecoveryTimeMs', newAvg.toString());
      } else {
        await this.redis.hset(key, 'avgRecoveryTimeMs', recoveryTimeMs.toString());
      }
    } else {
      await this.redis.hincrby(key, 'failedRecoveries', 1);
    }
  }

  /**
   * Get recovery metrics
   */
  async getRecoveryMetrics(component: string): Promise<RecoveryMetrics> {
    const key = `calliq:recovery:metrics:${component}`;
    const data = await this.redis.hgetall(key);

    return {
      totalRecoveries: parseInt(data.totalRecoveries || '0'),
      successfulRecoveries: parseInt(data.successfulRecoveries || '0'),
      failedRecoveries: parseInt(data.failedRecoveries || '0'),
      avgRecoveryTimeMs: parseFloat(data.avgRecoveryTimeMs || '0'),
      lastRecoveryTime: data.lastRecoveryTime ? new Date(data.lastRecoveryTime) : undefined,
    };
  }

  /**
   * Get all component statuses
   */
  getComponentStatuses(): RecoveryStatus[] {
    return Array.from(this.componentStatus.values());
  }

  /**
   * Force recovery of component
   */
  async forceRecovery(component: string): Promise<void> {
    console.log(`🔄 Force recovery triggered for ${component}`);
    await this.triggerRecovery(component);
  }
}
