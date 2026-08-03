/**
 * Reliability Scoring Engine
 * 
 * Automated health scoring, regression detection, and deployment readiness gates
 */

import { EventEmitter } from 'events';
import { Redis } from 'ioredis';

export interface ReliabilityScore {
  overall: number; // 0-100
  components: {
    sessionStability: number;
    websocketHealth: number;
    audioQuality: number;
    toolReliability: number;
    latencyHealth: number;
    resourceHealth: number;
  };
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  deploymentReady: boolean;
  issues: string[];
  recommendations: string[];
  timestamp: Date;
}

export interface HealthMetrics {
  // Session metrics
  activeSessions: number;
  sessionFailureRate: number;
  zombieSessionRate: number;
  orphanSessionRate: number;
  
  // WebSocket metrics
  activeConnections: number;
  connectionFailureRate: number;
  reconnectRate: number;
  
  // Audio metrics
  audioLatencyP95: number;
  audioDropoutRate: number;
  audioJitter: number;
  
  // Tool metrics
  toolSuccessRate: number;
  toolTimeoutRate: number;
  toolLatencyP95: number;
  
  // System metrics
  memoryUsagePercent: number;
  eventLoopLag: number;
  cpuUsagePercent: number;
  
  // External dependencies
  redisLatency: number;
  openaiLatency: number;
  openaiErrorRate: number;
}

export interface RegressionReport {
  detected: boolean;
  regressions: Array<{
    metric: string;
    baseline: number;
    current: number;
    change: number;
    severity: 'critical' | 'major' | 'minor';
  }>;
  timestamp: Date;
}

/**
 * Reliability Scoring Engine
 */
export class ReliabilityScoringEngine extends EventEmitter {
  private redis: Redis;
  private baselineMetrics: HealthMetrics | null = null;

  constructor(redisUrl: string) {
    super();
    this.redis = new Redis(redisUrl);
  }

  /**
   * Calculate comprehensive reliability score
   */
  async calculateScore(metrics: HealthMetrics): Promise<ReliabilityScore> {
    const components = {
      sessionStability: this.scoreSessionStability(metrics),
      websocketHealth: this.scoreWebSocketHealth(metrics),
      audioQuality: this.scoreAudioQuality(metrics),
      toolReliability: this.scoreToolReliability(metrics),
      latencyHealth: this.scoreLatencyHealth(metrics),
      resourceHealth: this.scoreResourceHealth(metrics),
    };

    // Weighted average
    const weights = {
      sessionStability: 0.25,
      websocketHealth: 0.20,
      audioQuality: 0.20,
      toolReliability: 0.15,
      latencyHealth: 0.15,
      resourceHealth: 0.05,
    };

    const overall = Object.entries(components).reduce((sum, [key, score]) => {
      return sum + score * weights[key as keyof typeof weights];
    }, 0);

    const grade = this.calculateGrade(overall);
    const deploymentReady = this.isDeploymentReady(overall, components);
    const issues = this.identifyIssues(metrics, components);
    const recommendations = this.generateRecommendations(issues, components);

    const score: ReliabilityScore = {
      overall: Math.round(overall),
      components,
      grade,
      deploymentReady,
      issues,
      recommendations,
      timestamp: new Date(),
    };

    // Store score in Redis
    await this.storeScore(score);

    this.emit('score.calculated', score);

    return score;
  }

  /**
   * Score session stability (0-100)
   */
  private scoreSessionStability(metrics: HealthMetrics): number {
    let score = 100;

    // Penalize session failures
    if (metrics.sessionFailureRate > 0.01) score -= 20; // >1% failure rate
    if (metrics.sessionFailureRate > 0.05) score -= 30; // >5% failure rate
    if (metrics.sessionFailureRate > 0.10) score -= 50; // >10% failure rate

    // Penalize zombie sessions
    if (metrics.zombieSessionRate > 0.01) score -= 15;
    if (metrics.zombieSessionRate > 0.05) score -= 30;

    // Penalize orphan sessions
    if (metrics.orphanSessionRate > 0.01) score -= 10;
    if (metrics.orphanSessionRate > 0.05) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Score WebSocket health (0-100)
   */
  private scoreWebSocketHealth(metrics: HealthMetrics): number {
    let score = 100;

    // Penalize connection failures
    if (metrics.connectionFailureRate > 0.05) score -= 20;
    if (metrics.connectionFailureRate > 0.10) score -= 40;
    if (metrics.connectionFailureRate > 0.20) score -= 60;

    // Penalize frequent reconnects
    if (metrics.reconnectRate > 0.1) score -= 15;
    if (metrics.reconnectRate > 0.5) score -= 30;

    return Math.max(0, score);
  }

  /**
   * Score audio quality (0-100)
   */
  private scoreAudioQuality(metrics: HealthMetrics): number {
    let score = 100;

    // Penalize high latency
    if (metrics.audioLatencyP95 > 800) score -= 20;
    if (metrics.audioLatencyP95 > 1200) score -= 40;
    if (metrics.audioLatencyP95 > 2000) score -= 60;

    // Penalize audio dropouts
    if (metrics.audioDropoutRate > 0.02) score -= 15;
    if (metrics.audioDropoutRate > 0.05) score -= 30;
    if (metrics.audioDropoutRate > 0.10) score -= 50;

    // Penalize high jitter
    if (metrics.audioJitter > 50) score -= 10;
    if (metrics.audioJitter > 100) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Score tool reliability (0-100)
   */
  private scoreToolReliability(metrics: HealthMetrics): number {
    let score = 100;

    // Penalize low success rate
    if (metrics.toolSuccessRate < 0.95) score -= 20;
    if (metrics.toolSuccessRate < 0.90) score -= 40;
    if (metrics.toolSuccessRate < 0.80) score -= 60;

    // Penalize timeouts
    if (metrics.toolTimeoutRate > 0.05) score -= 15;
    if (metrics.toolTimeoutRate > 0.10) score -= 30;

    // Penalize high latency
    if (metrics.toolLatencyP95 > 10000) score -= 10;
    if (metrics.toolLatencyP95 > 30000) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Score latency health (0-100)
   */
  private scoreLatencyHealth(metrics: HealthMetrics): number {
    let score = 100;

    // Redis latency
    if (metrics.redisLatency > 50) score -= 10;
    if (metrics.redisLatency > 100) score -= 20;

    // OpenAI latency
    if (metrics.openaiLatency > 1000) score -= 10;
    if (metrics.openaiLatency > 2000) score -= 20;
    if (metrics.openaiLatency > 5000) score -= 30;

    // OpenAI errors
    if (metrics.openaiErrorRate > 0.05) score -= 15;
    if (metrics.openaiErrorRate > 0.10) score -= 30;

    return Math.max(0, score);
  }

  /**
   * Score resource health (0-100)
   */
  private scoreResourceHealth(metrics: HealthMetrics): number {
    let score = 100;

    // Memory usage
    if (metrics.memoryUsagePercent > 80) score -= 15;
    if (metrics.memoryUsagePercent > 90) score -= 30;
    if (metrics.memoryUsagePercent > 95) score -= 50;

    // Event loop lag
    if (metrics.eventLoopLag > 50) score -= 10;
    if (metrics.eventLoopLag > 100) score -= 20;
    if (metrics.eventLoopLag > 200) score -= 40;

    // CPU usage
    if (metrics.cpuUsagePercent > 70) score -= 10;
    if (metrics.cpuUsagePercent > 85) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Calculate letter grade
   */
  private calculateGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 97) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Determine deployment readiness
   */
  private isDeploymentReady(overall: number, components: ReliabilityScore['components']): boolean {
    // Overall score must be >= 85
    if (overall < 85) return false;

    // Critical components must be >= 80
    if (components.sessionStability < 80) return false;
    if (components.websocketHealth < 80) return false;
    if (components.audioQuality < 75) return false;

    return true;
  }

  /**
   * Identify issues
   */
  private identifyIssues(metrics: HealthMetrics, components: ReliabilityScore['components']): string[] {
    const issues: string[] = [];

    // Session issues
    if (components.sessionStability < 80) {
      if (metrics.sessionFailureRate > 0.05) {
        issues.push(`High session failure rate: ${(metrics.sessionFailureRate * 100).toFixed(2)}%`);
      }
      if (metrics.zombieSessionRate > 0.01) {
        issues.push(`Zombie sessions detected: ${(metrics.zombieSessionRate * 100).toFixed(2)}%`);
      }
      if (metrics.orphanSessionRate > 0.01) {
        issues.push(`Orphan sessions detected: ${(metrics.orphanSessionRate * 100).toFixed(2)}%`);
      }
    }

    // WebSocket issues
    if (components.websocketHealth < 80) {
      if (metrics.connectionFailureRate > 0.10) {
        issues.push(`High WebSocket failure rate: ${(metrics.connectionFailureRate * 100).toFixed(2)}%`);
      }
      if (metrics.reconnectRate > 0.5) {
        issues.push(`Frequent reconnects: ${metrics.reconnectRate.toFixed(2)}/sec`);
      }
    }

    // Audio issues
    if (components.audioQuality < 75) {
      if (metrics.audioLatencyP95 > 800) {
        issues.push(`High audio latency: ${metrics.audioLatencyP95.toFixed(0)}ms P95`);
      }
      if (metrics.audioDropoutRate > 0.05) {
        issues.push(`High audio dropout rate: ${(metrics.audioDropoutRate * 100).toFixed(2)}%`);
      }
    }

    // Tool issues
    if (components.toolReliability < 80) {
      if (metrics.toolSuccessRate < 0.90) {
        issues.push(`Low tool success rate: ${(metrics.toolSuccessRate * 100).toFixed(1)}%`);
      }
      if (metrics.toolTimeoutRate > 0.10) {
        issues.push(`High tool timeout rate: ${(metrics.toolTimeoutRate * 100).toFixed(2)}%`);
      }
    }

    // Latency issues
    if (components.latencyHealth < 80) {
      if (metrics.redisLatency > 100) {
        issues.push(`High Redis latency: ${metrics.redisLatency.toFixed(0)}ms`);
      }
      if (metrics.openaiLatency > 2000) {
        issues.push(`High OpenAI latency: ${metrics.openaiLatency.toFixed(0)}ms`);
      }
    }

    // Resource issues
    if (components.resourceHealth < 70) {
      if (metrics.memoryUsagePercent > 90) {
        issues.push(`High memory usage: ${metrics.memoryUsagePercent.toFixed(1)}%`);
      }
      if (metrics.eventLoopLag > 100) {
        issues.push(`High event loop lag: ${metrics.eventLoopLag.toFixed(0)}ms`);
      }
    }

    return issues;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(issues: string[], components: ReliabilityScore['components']): string[] {
    const recommendations: string[] = [];

    if (components.sessionStability < 80) {
      recommendations.push('Review session lifecycle cleanup logic');
      recommendations.push('Increase heartbeat frequency');
      recommendations.push('Investigate zombie session root causes');
    }

    if (components.websocketHealth < 80) {
      recommendations.push('Review WebSocket error handling');
      recommendations.push('Implement exponential backoff for reconnects');
      recommendations.push('Check network stability');
    }

    if (components.audioQuality < 75) {
      recommendations.push('Optimize audio pipeline buffering');
      recommendations.push('Review packet loss tolerance');
      recommendations.push('Consider reducing audio quality for high-latency connections');
    }

    if (components.toolReliability < 80) {
      recommendations.push('Review tool timeout configurations');
      recommendations.push('Implement circuit breakers for failing tools');
      recommendations.push('Add retry logic with exponential backoff');
    }

    if (components.latencyHealth < 80) {
      recommendations.push('Optimize Redis queries');
      recommendations.push('Review OpenAI API usage patterns');
      recommendations.push('Consider caching frequently accessed data');
    }

    if (components.resourceHealth < 70) {
      recommendations.push('Investigate memory leaks');
      recommendations.push('Optimize event loop usage');
      recommendations.push('Consider horizontal scaling');
    }

    return recommendations;
  }

  /**
   * Detect regressions
   */
  async detectRegressions(current: HealthMetrics): Promise<RegressionReport> {
    if (!this.baselineMetrics) {
      // No baseline yet, store current as baseline
      this.baselineMetrics = current;
      await this.storeBaseline(current);
      
      return {
        detected: false,
        regressions: [],
        timestamp: new Date(),
      };
    }

    const regressions: RegressionReport['regressions'] = [];

    // Check each metric for regression
    const checks = [
      { metric: 'sessionFailureRate', threshold: 0.02, direction: 'increase' },
      { metric: 'audioLatencyP95', threshold: 100, direction: 'increase' },
      { metric: 'audioDropoutRate', threshold: 0.01, direction: 'increase' },
      { metric: 'toolSuccessRate', threshold: 0.05, direction: 'decrease' },
      { metric: 'memoryUsagePercent', threshold: 10, direction: 'increase' },
      { metric: 'eventLoopLag', threshold: 20, direction: 'increase' },
    ];

    for (const check of checks) {
      const baseline = this.baselineMetrics[check.metric as keyof HealthMetrics] as number;
      const currentValue = current[check.metric as keyof HealthMetrics] as number;
      const change = currentValue - baseline;
      const changePercent = (change / baseline) * 100;

      let isRegression = false;
      let severity: 'critical' | 'major' | 'minor' = 'minor';

      if (check.direction === 'increase') {
        if (change > check.threshold) {
          isRegression = true;
          if (changePercent > 50) severity = 'critical';
          else if (changePercent > 25) severity = 'major';
        }
      } else {
        if (change < -check.threshold) {
          isRegression = true;
          if (changePercent < -50) severity = 'critical';
          else if (changePercent < -25) severity = 'major';
        }
      }

      if (isRegression) {
        regressions.push({
          metric: check.metric,
          baseline,
          current: currentValue,
          change,
          severity,
        });
      }
    }

    const report: RegressionReport = {
      detected: regressions.length > 0,
      regressions,
      timestamp: new Date(),
    };

    if (report.detected) {
      this.emit('regression.detected', report);
    }

    return report;
  }

  /**
   * Store score in Redis
   */
  private async storeScore(score: ReliabilityScore): Promise<void> {
    const key = `calliq:reliability:score:${Date.now()}`;
    await this.redis.set(key, JSON.stringify(score), 'EX', 86400); // 24 hour TTL

    // Store latest score
    await this.redis.set('calliq:reliability:score:latest', JSON.stringify(score));
  }

  /**
   * Store baseline metrics
   */
  private async storeBaseline(metrics: HealthMetrics): Promise<void> {
    await this.redis.set('calliq:reliability:baseline', JSON.stringify(metrics));
  }

  /**
   * Load baseline metrics
   */
  async loadBaseline(): Promise<void> {
    const data = await this.redis.get('calliq:reliability:baseline');
    if (data) {
      this.baselineMetrics = JSON.parse(data);
    }
  }

  /**
   * Get score history
   */
  async getScoreHistory(hours: number = 24): Promise<ReliabilityScore[]> {
    const keys = await this.redis.keys('calliq:reliability:score:*');
    const scores: ReliabilityScore[] = [];

    const cutoff = Date.now() - hours * 60 * 60 * 1000;

    for (const key of keys) {
      if (key === 'calliq:reliability:score:latest') continue;

      const timestamp = parseInt(key.split(':').pop() || '0');
      if (timestamp < cutoff) continue;

      const data = await this.redis.get(key);
      if (data) {
        scores.push(JSON.parse(data));
      }
    }

    return scores.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async cleanup(): Promise<void> {
    await this.redis.quit();
  }
}
