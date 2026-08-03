/**
 * Autoscaling Policy Configuration
 * 
 * Defines scaling thresholds, strategies, and safety limits for production deployment
 */

export interface ScalingMetrics {
  // Resource metrics
  cpuPercent: number;
  memoryPercent: number;
  eventLoopLag: number;
  
  // Application metrics
  activeSessions: number;
  activeConnections: number;
  requestsPerSecond: number;
  
  // Performance metrics
  p95Latency: number;
  errorRate: number;
  
  // Capacity metrics
  sessionCapacityPercent: number;
  connectionCapacityPercent: number;
}

export interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'no_action';
  reason: string;
  targetInstances: number;
  currentInstances: number;
  metrics: ScalingMetrics;
  timestamp: Date;
}

export interface ScalingConfig {
  // Instance limits
  minInstances: number;
  maxInstances: number;
  
  // Scale up thresholds
  scaleUpCpuPercent: number;
  scaleUpMemoryPercent: number;
  scaleUpSessionPercent: number;
  scaleUpLatencyMs: number;
  
  // Scale down thresholds
  scaleDownCpuPercent: number;
  scaleDownMemoryPercent: number;
  scaleDownSessionPercent: number;
  
  // Cooldown periods (prevent flapping)
  scaleUpCooldownSeconds: number;
  scaleDownCooldownSeconds: number;
  
  // Safety limits
  maxSessionsPerInstance: number;
  maxConnectionsPerInstance: number;
}

/**
 * Production Autoscaling Configuration
 */
export const PRODUCTION_SCALING_CONFIG: ScalingConfig = {
  // Instance limits
  minInstances: 2, // Always maintain 2 instances for HA
  maxInstances: 10, // Maximum 10 instances
  
  // Scale up thresholds (aggressive)
  scaleUpCpuPercent: 70, // Scale up at 70% CPU
  scaleUpMemoryPercent: 80, // Scale up at 80% memory
  scaleUpSessionPercent: 75, // Scale up at 75% session capacity
  scaleUpLatencyMs: 1000, // Scale up if P95 latency > 1s
  
  // Scale down thresholds (conservative)
  scaleDownCpuPercent: 30, // Scale down below 30% CPU
  scaleDownMemoryPercent: 40, // Scale down below 40% memory
  scaleDownSessionPercent: 25, // Scale down below 25% session capacity
  
  // Cooldown periods
  scaleUpCooldownSeconds: 60, // Wait 1 minute before scaling up again
  scaleDownCooldownSeconds: 300, // Wait 5 minutes before scaling down again
  
  // Safety limits
  maxSessionsPerInstance: 50, // Maximum 50 concurrent sessions per instance
  maxConnectionsPerInstance: 100, // Maximum 100 WebSocket connections per instance
};

/**
 * Staging Autoscaling Configuration
 */
export const STAGING_SCALING_CONFIG: ScalingConfig = {
  minInstances: 1,
  maxInstances: 3,
  
  scaleUpCpuPercent: 80,
  scaleUpMemoryPercent: 85,
  scaleUpSessionPercent: 80,
  scaleUpLatencyMs: 2000,
  
  scaleDownCpuPercent: 20,
  scaleDownMemoryPercent: 30,
  scaleDownSessionPercent: 20,
  
  scaleUpCooldownSeconds: 120,
  scaleDownCooldownSeconds: 600,
  
  maxSessionsPerInstance: 25,
  maxConnectionsPerInstance: 50,
};

/**
 * Autoscaling Decision Engine
 */
export class AutoscalingEngine {
  private config: ScalingConfig;
  private lastScaleUpTime: Date | null = null;
  private lastScaleDownTime: Date | null = null;

  constructor(config: ScalingConfig) {
    this.config = config;
  }

  /**
   * Evaluate scaling decision based on current metrics
   */
  evaluateScaling(metrics: ScalingMetrics, currentInstances: number): ScalingDecision {
    const now = new Date();

    // Check cooldown periods
    const scaleUpCooldownActive = this.lastScaleUpTime && 
      (now.getTime() - this.lastScaleUpTime.getTime()) < this.config.scaleUpCooldownSeconds * 1000;
    
    const scaleDownCooldownActive = this.lastScaleDownTime && 
      (now.getTime() - this.lastScaleDownTime.getTime()) < this.config.scaleDownCooldownSeconds * 1000;

    // Evaluate scale up conditions
    const shouldScaleUp = this.shouldScaleUp(metrics, currentInstances);
    if (shouldScaleUp.should && !scaleUpCooldownActive) {
      this.lastScaleUpTime = now;
      
      return {
        action: 'scale_up',
        reason: shouldScaleUp.reason,
        targetInstances: Math.min(currentInstances + 1, this.config.maxInstances),
        currentInstances,
        metrics,
        timestamp: now,
      };
    }

    // Evaluate scale down conditions
    const shouldScaleDown = this.shouldScaleDown(metrics, currentInstances);
    if (shouldScaleDown.should && !scaleDownCooldownActive) {
      this.lastScaleDownTime = now;
      
      return {
        action: 'scale_down',
        reason: shouldScaleDown.reason,
        targetInstances: Math.max(currentInstances - 1, this.config.minInstances),
        currentInstances,
        metrics,
        timestamp: now,
      };
    }

    // No action needed
    return {
      action: 'no_action',
      reason: 'Metrics within acceptable range',
      targetInstances: currentInstances,
      currentInstances,
      metrics,
      timestamp: now,
    };
  }

  /**
   * Check if should scale up
   */
  private shouldScaleUp(metrics: ScalingMetrics, currentInstances: number): { should: boolean; reason: string } {
    // Already at max instances
    if (currentInstances >= this.config.maxInstances) {
      return { should: false, reason: 'At maximum instance count' };
    }

    // CPU threshold exceeded
    if (metrics.cpuPercent >= this.config.scaleUpCpuPercent) {
      return { should: true, reason: `CPU usage ${metrics.cpuPercent.toFixed(1)}% exceeds threshold ${this.config.scaleUpCpuPercent}%` };
    }

    // Memory threshold exceeded
    if (metrics.memoryPercent >= this.config.scaleUpMemoryPercent) {
      return { should: true, reason: `Memory usage ${metrics.memoryPercent.toFixed(1)}% exceeds threshold ${this.config.scaleUpMemoryPercent}%` };
    }

    // Session capacity threshold exceeded
    if (metrics.sessionCapacityPercent >= this.config.scaleUpSessionPercent) {
      return { should: true, reason: `Session capacity ${metrics.sessionCapacityPercent.toFixed(1)}% exceeds threshold ${this.config.scaleUpSessionPercent}%` };
    }

    // Latency threshold exceeded
    if (metrics.p95Latency >= this.config.scaleUpLatencyMs) {
      return { should: true, reason: `P95 latency ${metrics.p95Latency.toFixed(0)}ms exceeds threshold ${this.config.scaleUpLatencyMs}ms` };
    }

    // Event loop lag (critical)
    if (metrics.eventLoopLag >= 100) {
      return { should: true, reason: `Event loop lag ${metrics.eventLoopLag.toFixed(0)}ms indicates overload` };
    }

    return { should: false, reason: 'No scale up conditions met' };
  }

  /**
   * Check if should scale down
   */
  private shouldScaleDown(metrics: ScalingMetrics, currentInstances: number): { should: boolean; reason: string } {
    // Already at min instances
    if (currentInstances <= this.config.minInstances) {
      return { should: false, reason: 'At minimum instance count' };
    }

    // Don't scale down if any metric is elevated
    if (metrics.cpuPercent >= this.config.scaleDownCpuPercent) {
      return { should: false, reason: 'CPU usage too high for scale down' };
    }

    if (metrics.memoryPercent >= this.config.scaleDownMemoryPercent) {
      return { should: false, reason: 'Memory usage too high for scale down' };
    }

    if (metrics.sessionCapacityPercent >= this.config.scaleDownSessionPercent) {
      return { should: false, reason: 'Session capacity too high for scale down' };
    }

    // All metrics are low - safe to scale down
    return { 
      should: true, 
      reason: `All metrics below scale down thresholds (CPU: ${metrics.cpuPercent.toFixed(1)}%, Memory: ${metrics.memoryPercent.toFixed(1)}%, Sessions: ${metrics.sessionCapacityPercent.toFixed(1)}%)` 
    };
  }

  /**
   * Calculate session capacity percentage
   */
  static calculateSessionCapacity(activeSessions: number, instances: number, maxPerInstance: number): number {
    const totalCapacity = instances * maxPerInstance;
    return (activeSessions / totalCapacity) * 100;
  }

  /**
   * Calculate connection capacity percentage
   */
  static calculateConnectionCapacity(activeConnections: number, instances: number, maxPerInstance: number): number {
    const totalCapacity = instances * maxPerInstance;
    return (activeConnections / totalCapacity) * 100;
  }
}

/**
 * Get scaling configuration based on environment
 */
export function getScalingConfig(): ScalingConfig {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return PRODUCTION_SCALING_CONFIG;
    case 'staging':
      return STAGING_SCALING_CONFIG;
    default:
      return STAGING_SCALING_CONFIG;
  }
}

/**
 * Scaling recommendations for capacity planning
 */
export interface CapacityRecommendation {
  currentCapacity: {
    instances: number;
    maxSessions: number;
    maxConnections: number;
  };
  utilization: {
    sessionPercent: number;
    connectionPercent: number;
    cpuPercent: number;
    memoryPercent: number;
  };
  recommendations: string[];
  estimatedHeadroom: {
    additionalSessions: number;
    additionalConnections: number;
  };
}

/**
 * Generate capacity recommendations
 */
export function generateCapacityRecommendations(
  metrics: ScalingMetrics,
  currentInstances: number,
  config: ScalingConfig
): CapacityRecommendation {
  const maxSessions = currentInstances * config.maxSessionsPerInstance;
  const maxConnections = currentInstances * config.maxConnectionsPerInstance;
  
  const sessionPercent = (metrics.activeSessions / maxSessions) * 100;
  const connectionPercent = (metrics.activeConnections / maxConnections) * 100;
  
  const recommendations: string[] = [];

  // Session capacity recommendations
  if (sessionPercent > 80) {
    recommendations.push('⚠️ Session capacity >80% - consider scaling up immediately');
  } else if (sessionPercent > 60) {
    recommendations.push('⚡ Session capacity >60% - prepare for potential scale up');
  } else if (sessionPercent < 20 && currentInstances > config.minInstances) {
    recommendations.push('💡 Session capacity <20% - consider scaling down to reduce costs');
  }

  // CPU recommendations
  if (metrics.cpuPercent > 80) {
    recommendations.push('🔥 CPU usage >80% - scale up urgently');
  } else if (metrics.cpuPercent > 60) {
    recommendations.push('⚡ CPU usage >60% - monitor closely');
  }

  // Memory recommendations
  if (metrics.memoryPercent > 85) {
    recommendations.push('🔥 Memory usage >85% - scale up urgently');
  } else if (metrics.memoryPercent > 70) {
    recommendations.push('⚡ Memory usage >70% - monitor closely');
  }

  // Latency recommendations
  if (metrics.p95Latency > 1000) {
    recommendations.push('🐌 P95 latency >1s - scale up to improve performance');
  }

  // Event loop recommendations
  if (metrics.eventLoopLag > 50) {
    recommendations.push('⚠️ Event loop lag detected - reduce load or scale up');
  }

  // Headroom calculation
  const additionalSessions = Math.max(0, maxSessions - metrics.activeSessions);
  const additionalConnections = Math.max(0, maxConnections - metrics.activeConnections);

  return {
    currentCapacity: {
      instances: currentInstances,
      maxSessions,
      maxConnections,
    },
    utilization: {
      sessionPercent,
      connectionPercent,
      cpuPercent: metrics.cpuPercent,
      memoryPercent: metrics.memoryPercent,
    },
    recommendations,
    estimatedHeadroom: {
      additionalSessions,
      additionalConnections,
    },
  };
}
