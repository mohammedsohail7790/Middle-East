/**
 * Scenario Runner
 * 
 * Orchestrates execution of synthetic caller test scenarios.
 * Supports single, batch, and concurrent execution with comprehensive reporting.
 */

import { EventEmitter } from 'events';
import { SyntheticCallerEngine } from './caller-engine.js';
import {
  CallerPersonality,
  TestScenario,
  TestResult,
  SyntheticCallerConfig,
} from './types.js';

export interface ScenarioRunnerConfig {
  gatewayUrl: string;
  tenantId: string;
  debug?: boolean;
  concurrentLimit?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

export interface TestReport {
  totalScenarios: number;
  passed: number;
  failed: number;
  successRate: number;
  totalDuration: number;
  averageDuration: number;
  results: TestResult[];
  summary: {
    byPersonality: Record<string, { passed: number; failed: number; successRate: number }>;
    byScenario: Record<string, { passed: number; failed: number; successRate: number }>;
  };
  metrics: {
    averageTurnLatency: number;
    p95TurnLatency: number;
    p99TurnLatency: number;
    totalInterruptions: number;
    totalToolCalls: number;
    totalReconnects: number;
  };
}

export class ScenarioRunner extends EventEmitter {
  private config: ScenarioRunnerConfig;
  private results: TestResult[] = [];

  constructor(config: ScenarioRunnerConfig) {
    super();
    this.config = config;
  }

  /**
   * Run a single scenario
   */
  async runSingle(
    personality: CallerPersonality,
    scenario: TestScenario
  ): Promise<TestResult> {
    this.emit('scenario.starting', {
      personality: personality.type,
      scenario: scenario.name,
    });

    const callerConfig: SyntheticCallerConfig = {
      tenantId: this.config.tenantId,
      gatewayUrl: this.config.gatewayUrl,
      personality,
      scenario,
      debug: this.config.debug,
    };

    const engine = new SyntheticCallerEngine(callerConfig);

    // Forward engine events
    this.forwardEngineEvents(engine);

    try {
      const result = await engine.runScenario();
      this.results.push(result);

      this.emit('scenario.completed', {
        personality: personality.type,
        scenario: scenario.name,
        success: result.success,
        duration: result.duration,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.emit('scenario.error', {
        personality: personality.type,
        scenario: scenario.name,
        error: errorMsg,
      });

      throw error;
    }
  }

  /**
   * Run multiple scenarios in sequence
   */
  async runBatch(
    scenarios: Array<{ personality: CallerPersonality; scenario: TestScenario }>
  ): Promise<TestResult[]> {
    this.emit('batch.started', { count: scenarios.length });

    const results: TestResult[] = [];

    for (let i = 0; i < scenarios.length; i++) {
      const { personality, scenario } = scenarios[i];

      this.emit('batch.progress', {
        current: i + 1,
        total: scenarios.length,
        personality: personality.type,
        scenario: scenario.name,
      });

      try {
        const result = await this.runSingle(personality, scenario);
        results.push(result);

        // Retry on failure if configured
        if (!result.success && this.config.retryOnFailure) {
          const maxRetries = this.config.maxRetries || 2;
          
          for (let retry = 1; retry <= maxRetries; retry++) {
            this.emit('scenario.retrying', {
              personality: personality.type,
              scenario: scenario.name,
              attempt: retry + 1,
            });

            const retryResult = await this.runSingle(personality, scenario);
            if (retryResult.success) {
              break;
            }
          }
        }

        // Small delay between scenarios
        await this.delay(1000);

      } catch (error) {
        this.emit('batch.scenario.failed', {
          personality: personality.type,
          scenario: scenario.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.emit('batch.completed', {
      total: scenarios.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });

    return results;
  }

  /**
   * Run scenarios concurrently
   */
  async runConcurrent(
    scenarios: Array<{ personality: CallerPersonality; scenario: TestScenario }>,
    concurrency?: number
  ): Promise<TestResult[]> {
    const limit = concurrency || this.config.concurrentLimit || 10;

    this.emit('concurrent.started', {
      count: scenarios.length,
      concurrency: limit,
    });

    const results: TestResult[] = [];
    const executing: Promise<void>[] = [];

    for (let i = 0; i < scenarios.length; i++) {
      const { personality, scenario } = scenarios[i];

      const promise = this.runSingle(personality, scenario)
        .then(result => {
          results.push(result);
        })
        .catch(error => {
          this.emit('concurrent.scenario.failed', {
            personality: personality.type,
            scenario: scenario.name,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          executing.splice(executing.indexOf(promise), 1);
        });

      executing.push(promise);

      // Wait if we've hit the concurrency limit
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }

    // Wait for all remaining promises
    await Promise.all(executing);

    this.emit('concurrent.completed', {
      total: scenarios.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });

    return results;
  }

  /**
   * Run load test with multiple concurrent callers
   */
  async runLoadTest(
    personality: CallerPersonality,
    scenario: TestScenario,
    concurrentCount: number
  ): Promise<TestResult[]> {
    this.emit('load.started', {
      personality: personality.type,
      scenario: scenario.name,
      concurrentCount,
    });

    const scenarios = Array(concurrentCount).fill({ personality, scenario });
    const results = await this.runConcurrent(scenarios, concurrentCount);

    this.emit('load.completed', {
      concurrentCount,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      averageDuration: this.calculateAverage(results.map(r => r.duration)),
    });

    return results;
  }

  /**
   * Generate comprehensive test report
   */
  generateReport(results?: TestResult[]): TestReport {
    const testResults = results || this.results;

    if (testResults.length === 0) {
      return this.emptyReport();
    }

    const passed = testResults.filter(r => r.success).length;
    const failed = testResults.length - passed;
    const successRate = (passed / testResults.length) * 100;

    // Group by personality
    const byPersonality: Record<string, { passed: number; failed: number; successRate: number }> = {};
    for (const result of testResults) {
      if (!byPersonality[result.personality]) {
        byPersonality[result.personality] = { passed: 0, failed: 0, successRate: 0 };
      }
      if (result.success) {
        byPersonality[result.personality].passed++;
      } else {
        byPersonality[result.personality].failed++;
      }
    }

    // Calculate success rates
    for (const personality in byPersonality) {
      const stats = byPersonality[personality];
      const total = stats.passed + stats.failed;
      stats.successRate = (stats.passed / total) * 100;
    }

    // Group by scenario
    const byScenario: Record<string, { passed: number; failed: number; successRate: number }> = {};
    for (const result of testResults) {
      if (!byScenario[result.scenarioName]) {
        byScenario[result.scenarioName] = { passed: 0, failed: 0, successRate: 0 };
      }
      if (result.success) {
        byScenario[result.scenarioName].passed++;
      } else {
        byScenario[result.scenarioName].failed++;
      }
    }

    // Calculate success rates
    for (const scenario in byScenario) {
      const stats = byScenario[scenario];
      const total = stats.passed + stats.failed;
      stats.successRate = (stats.passed / total) * 100;
    }

    // Aggregate metrics
    const allLatencies = testResults.flatMap(r => [
      r.metrics.averageTurnLatency,
      r.metrics.p95TurnLatency,
      r.metrics.p99TurnLatency,
    ].filter(v => v > 0));

    const metrics = {
      averageTurnLatency: this.calculateAverage(allLatencies),
      p95TurnLatency: this.calculatePercentile(allLatencies, 0.95),
      p99TurnLatency: this.calculatePercentile(allLatencies, 0.99),
      totalInterruptions: testResults.reduce((sum, r) => sum + r.metrics.interruptionCount, 0),
      totalToolCalls: testResults.reduce((sum, r) => sum + r.metrics.toolCallCount, 0),
      totalReconnects: testResults.reduce((sum, r) => sum + r.metrics.reconnectCount, 0),
    };

    return {
      totalScenarios: testResults.length,
      passed,
      failed,
      successRate,
      totalDuration: testResults.reduce((sum, r) => sum + r.duration, 0),
      averageDuration: this.calculateAverage(testResults.map(r => r.duration)),
      results: testResults,
      summary: {
        byPersonality,
        byScenario,
      },
      metrics,
    };
  }

  /**
   * Print report to console
   */
  printReport(report: TestReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('SYNTHETIC CALLER TEST REPORT');
    console.log('='.repeat(80));
    console.log(`\nTotal Scenarios: ${report.totalScenarios}`);
    console.log(`Passed: ${report.passed} (${report.successRate.toFixed(1)}%)`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Total Duration: ${(report.totalDuration / 1000).toFixed(1)}s`);
    console.log(`Average Duration: ${(report.averageDuration / 1000).toFixed(1)}s`);

    console.log('\n' + '-'.repeat(80));
    console.log('METRICS');
    console.log('-'.repeat(80));
    console.log(`Average Turn Latency: ${report.metrics.averageTurnLatency.toFixed(0)}ms`);
    console.log(`P95 Turn Latency: ${report.metrics.p95TurnLatency.toFixed(0)}ms`);
    console.log(`P99 Turn Latency: ${report.metrics.p99TurnLatency.toFixed(0)}ms`);
    console.log(`Total Interruptions: ${report.metrics.totalInterruptions}`);
    console.log(`Total Tool Calls: ${report.metrics.totalToolCalls}`);
    console.log(`Total Reconnects: ${report.metrics.totalReconnects}`);

    console.log('\n' + '-'.repeat(80));
    console.log('BY PERSONALITY');
    console.log('-'.repeat(80));
    for (const [personality, stats] of Object.entries(report.summary.byPersonality)) {
      console.log(`${personality}: ${stats.passed}/${stats.passed + stats.failed} (${stats.successRate.toFixed(1)}%)`);
    }

    console.log('\n' + '-'.repeat(80));
    console.log('BY SCENARIO');
    console.log('-'.repeat(80));
    for (const [scenario, stats] of Object.entries(report.summary.byScenario)) {
      console.log(`${scenario}: ${stats.passed}/${stats.passed + stats.failed} (${stats.successRate.toFixed(1)}%)`);
    }

    console.log('\n' + '='.repeat(80) + '\n');
  }

  /**
   * Forward engine events
   */
  private forwardEngineEvents(engine: SyntheticCallerEngine): void {
    engine.on('connected', (data) => this.emit('engine.connected', data));
    engine.on('user.spoke', (data) => this.emit('engine.user.spoke', data));
    engine.on('interruption', (data) => this.emit('engine.interruption', data));
    engine.on('tool.executed', (data) => this.emit('engine.tool.executed', data));
    engine.on('error', (error) => this.emit('engine.error', error));
  }

  /**
   * Calculate average
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Empty report
   */
  private emptyReport(): TestReport {
    return {
      totalScenarios: 0,
      passed: 0,
      failed: 0,
      successRate: 0,
      totalDuration: 0,
      averageDuration: 0,
      results: [],
      summary: {
        byPersonality: {},
        byScenario: {},
      },
      metrics: {
        averageTurnLatency: 0,
        p95TurnLatency: 0,
        p99TurnLatency: 0,
        totalInterruptions: 0,
        totalToolCalls: 0,
        totalReconnects: 0,
      },
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all results
   */
  getResults(): TestResult[] {
    return this.results;
  }

  /**
   * Clear results
   */
  clearResults(): void {
    this.results = [];
  }
}
