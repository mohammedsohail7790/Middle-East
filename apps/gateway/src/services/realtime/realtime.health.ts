import { logger } from '../logger.js';
import { RealtimeGateway } from './realtime.gateway.js';

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastChecked: Date;
  responseTime?: number;
  details?: any;
}

export interface RealtimeHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  activeSessions: number;
  totalSessions: number;
  uptime: number;
  version: string;
  timestamp: Date;
}

export class RealtimeHealthMonitor {
  private readonly gateway: RealtimeGateway;
  private readonly startTime = Date.now();
  private healthHistory: HealthCheck[] = [];

  constructor(gateway: RealtimeGateway) {
    this.gateway = gateway;
  }

  async performHealthChecks(): Promise<RealtimeHealthStatus> {
    const checks: HealthCheck[] = [];
    const startTime = Date.now();

    // Check OpenAI API connectivity
    const openaiCheck = await this.checkOpenAIConnectivity();
    checks.push(openaiCheck);

    // Check Redis connectivity
    const redisCheck = await this.checkRedisConnectivity();
    checks.push(redisCheck);

    // Check WebSocket server status
    const wsCheck = await this.checkWebSocketServer();
    checks.push(wsCheck);

    // Check memory usage
    const memoryCheck = await this.checkMemoryUsage();
    checks.push(memoryCheck);

    // Check session health
    const sessionCheck = await this.checkSessionHealth();
    checks.push(sessionCheck);

    // Determine overall health
    const overallStatus = this.determineOverallStatus(checks);
    const debugInfo = this.gateway.getDebugInfo();

    const healthStatus: RealtimeHealthStatus = {
      overall: overallStatus,
      checks,
      activeSessions: debugInfo.activeConnections,
      totalSessions: debugInfo.activeSessions,
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date(),
    };

    // Store health history (keep last 100 checks)
    this.healthHistory.push(...checks);
    if (this.healthHistory.length > 100) {
      this.healthHistory = this.healthHistory.slice(-100);
    }

    logger.info('REALTIME_HEALTH_CHECK_COMPLETED', {
      overall: overallStatus,
      checksCount: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
      responseTime: Date.now() - startTime,
    });

    return healthStatus;
  }

  private async checkOpenAIConnectivity(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        return {
          name: 'openai_api',
          status: 'healthy',
          responseTime,
          lastChecked: new Date(),
          details: {
            statusCode: response.status,
            available: true,
          }
        };
      } else {
        return {
          name: 'openai_api',
          status: 'unhealthy',
          responseTime,
          lastChecked: new Date(),
          message: `HTTP ${response.status}: ${response.statusText}`,
          details: {
            statusCode: response.status,
            available: false,
          }
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'openai_api',
        status: 'unhealthy',
        responseTime,
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : String(error),
        details: {
          available: false,
          error: error instanceof Error ? error.message : String(error),
        }
      };
    }
  }

  private async checkRedisConnectivity(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const { voiceRedis } = await import('../voice/redis.client.js');
      await voiceRedis.ping();
      
      const responseTime = Date.now() - startTime;
      
      return {
        name: 'redis',
        status: 'healthy',
        responseTime,
        lastChecked: new Date(),
        details: {
          connected: true,
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'redis',
        status: 'unhealthy',
        responseTime,
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : String(error),
        details: {
          connected: false,
          error: error instanceof Error ? error.message : String(error),
        }
      };
    }
  }

  private async checkWebSocketServer(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const debugInfo = this.gateway.getDebugInfo();
      const responseTime = Date.now() - startTime;
      
      // Consider healthy if server is running and accepting connections
      const isHealthy = debugInfo.activeConnections >= 0;
      
      return {
        name: 'websocket_server',
        status: isHealthy ? 'healthy' : 'degraded',
        responseTime,
        lastChecked: new Date(),
        details: {
          activeConnections: debugInfo.activeConnections,
          activeSessions: debugInfo.activeSessions,
          running: true,
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'websocket_server',
        status: 'unhealthy',
        responseTime,
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : String(error),
        details: {
          running: false,
          error: error instanceof Error ? error.message : String(error),
        }
      };
    }
  }

  private async checkMemoryUsage(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const memUsage = process.memoryUsage();
      const totalMem = memUsage.heapTotal;
      const usedMem = memUsage.heapUsed;
      const memoryUsagePercent = (usedMem / totalMem) * 100;
      
      const responseTime = Date.now() - startTime;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (memoryUsagePercent < 70) {
        status = 'healthy';
      } else if (memoryUsagePercent < 85) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }
      
      return {
        name: 'memory',
        status,
        responseTime,
        lastChecked: new Date(),
        message: `Memory usage: ${memoryUsagePercent.toFixed(1)}%`,
        details: {
          heapUsed: Math.round(usedMem / 1024 / 1024), // MB
          heapTotal: Math.round(totalMem / 1024 / 1024), // MB
          usagePercent: Math.round(memoryUsagePercent * 100) / 100,
          external: Math.round(memUsage.external / 1024 / 1024), // MB
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'memory',
        status: 'unhealthy',
        responseTime,
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : String(error),
        details: {
          error: error instanceof Error ? error.message : String(error),
        }
      };
    }
  }

  private async checkSessionHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const debugInfo = this.gateway.getDebugInfo();
      const responseTime = Date.now() - startTime;
      
      // Check if sessions are within reasonable limits
      const maxSessions = Number(process.env.REALTIME_MAX_SESSIONS || '100');
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (debugInfo.activeSessions < maxSessions * 0.8) {
        status = 'healthy';
      } else if (debugInfo.activeSessions < maxSessions) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }
      
      return {
        name: 'sessions',
        status,
        responseTime,
        lastChecked: new Date(),
        message: `Active sessions: ${debugInfo.activeSessions}/${maxSessions}`,
        details: {
          activeSessions: debugInfo.activeSessions,
          activeConnections: debugInfo.activeConnections,
          maxSessions,
          utilizationPercent: Math.round((debugInfo.activeSessions / maxSessions) * 100),
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'sessions',
        status: 'unhealthy',
        responseTime,
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : String(error),
        details: {
          error: error instanceof Error ? error.message : String(error),
        }
      };
    }
  }

  private determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'degraded' | 'unhealthy' {
    const degradedCount = checks.filter(c => c.status === 'degraded').length;
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;

    if (unhealthyCount > 0) {
      return 'unhealthy';
    } else if (degradedCount > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  getHealthHistory(): HealthCheck[] {
    return [...this.healthHistory];
  }

  async getDetailedMetrics(): Promise<{
    uptime: number;
    totalChecks: number;
    averageResponseTime: number;
    errorRate: number;
    recentFailures: HealthCheck[];
  }> {
    const totalChecks = this.healthHistory.length;
    const recentFailures = this.healthHistory
      .filter(check => check.status !== 'healthy')
      .filter(check => Date.now() - check.lastChecked.getTime() < 5 * 60 * 1000); // Last 5 minutes

    const averageResponseTime = this.healthHistory.length > 0
      ? this.healthHistory.reduce((sum, check) => sum + (check.responseTime || 0), 0) / this.healthHistory.length
      : 0;

    const errorRate = totalChecks > 0
      ? (this.healthHistory.filter(check => check.status !== 'healthy').length / totalChecks) * 100
      : 0;

    return {
      uptime: Date.now() - this.startTime,
      totalChecks,
      averageResponseTime: Math.round(averageResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
      recentFailures,
    };
  }
}
