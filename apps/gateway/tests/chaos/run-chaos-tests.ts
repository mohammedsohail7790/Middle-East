/**
 * Chaos Testing Runner
 * 
 * Executes chaos engineering scenarios and generates comprehensive reports
 */

import { ChaosFramework, CHAOS_SCENARIOS, ChaosResult } from './chaos-framework.js';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:3003';
const TENANT_ID = process.env.TEST_TENANT_ID || 'test-tenant-id';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function runChaosTests() {
  console.log('\n' + '='.repeat(80));
  console.log('CHAOS ENGINEERING TEST SUITE');
  console.log('='.repeat(80) + '\n');

  const framework = new ChaosFramework({
    redisUrl: REDIS_URL,
    gatewayUrl: GATEWAY_URL,
    tenantId: TENANT_ID,
  });

  const results: ChaosResult[] = [];

  // Setup event listeners
  framework.on('scenario.started', (data) => {
    console.log(`\n▶ Starting: ${data.scenario}`);
  });

  framework.on('failure.injecting', (data) => {
    console.log(`  💥 Injecting ${data.type} failure (${data.intensity} intensity)`);
  });

  framework.on('failure.injected', (data) => {
    console.log(`  ✓ Injected ${data.count} failure(s)`);
  });

  framework.on('recovery.starting', () => {
    console.log(`  🔄 Starting recovery...`);
  });

  framework.on('recovery.completed', (data) => {
    console.log(`  ✓ Recovered in ${data.recoveryTime}ms`);
  });

  framework.on('scenario.failed', (data) => {
    console.log(`  ✗ Scenario failed: ${data.error}`);
  });

  // Run all scenarios
  for (const scenario of CHAOS_SCENARIOS) {
    try {
      const result = await framework.runScenario(scenario);
      results.push(result);

      if (result.success) {
        console.log(`  ✅ PASSED`);
      } else {
        console.log(`  ❌ FAILED`);
      }

      // Wait between scenarios
      await delay(5000);

    } catch (error) {
      console.error(`  ❌ ERROR: ${error}`);
    }
  }

  // Cleanup
  await framework.cleanup();

  // Print summary report
  printSummaryReport(results);
}

function printSummaryReport(results: ChaosResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('CHAOS TESTING SUMMARY');
  console.log('='.repeat(80) + '\n');

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => r.success === false).length;
  const total = results.length;

  console.log(`Total Scenarios: ${total}`);
  console.log(`Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed} (${((failed / total) * 100).toFixed(1)}%)`);

  console.log('\n' + '-'.repeat(80));
  console.log('DETAILED RESULTS');
  console.log('-'.repeat(80) + '\n');

  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | ${result.scenarioName}`);
    console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);
    console.log(`  Failures Injected: ${result.failuresInjected}`);
    console.log(`  System Recovered: ${result.systemRecovered ? 'Yes' : 'No'}`);
    
    if (result.recoveryTime) {
      console.log(`  Recovery Time: ${result.recoveryTime}ms`);
    }

    console.log(`  Metrics:`);
    console.log(`    - Sessions Affected: ${result.metrics.sessionsAffected}`);
    console.log(`    - Sessions Recovered: ${result.metrics.sessionsRecovered}`);
    console.log(`    - Data Loss: ${result.metrics.dataLoss ? 'Yes' : 'No'}`);
    console.log(`    - Graceful Degradation: ${result.metrics.gracefulDegradation ? 'Yes' : 'No'}`);
    console.log(`    - State Consistency: ${result.metrics.stateConsistency ? 'Yes' : 'No'}`);

    if (result.errors.length > 0) {
      console.log(`  Errors:`);
      result.errors.forEach(err => console.log(`    - ${err}`));
    }

    if (result.warnings.length > 0) {
      console.log(`  Warnings:`);
      result.warnings.forEach(warn => console.log(`    - ${warn}`));
    }

    console.log('');
  }

  console.log('='.repeat(80));

  // Calculate resilience score
  const resilienceScore = calculateResilienceScore(results);
  console.log(`\nRESILIENCE SCORE: ${resilienceScore.toFixed(1)}%`);
  
  if (resilienceScore >= 90) {
    console.log('🎉 EXCELLENT - Production ready for chaos');
  } else if (resilienceScore >= 75) {
    console.log('✅ GOOD - Minor improvements needed');
  } else if (resilienceScore >= 60) {
    console.log('⚠️  FAIR - Significant improvements needed');
  } else {
    console.log('❌ POOR - Not production ready');
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

function calculateResilienceScore(results: ChaosResult[]): number {
  if (results.length === 0) return 0;

  let totalScore = 0;

  for (const result of results) {
    let scenarioScore = 0;

    // Success/failure (40 points)
    if (result.success) scenarioScore += 40;

    // System recovery (20 points)
    if (result.systemRecovered) scenarioScore += 20;

    // Metrics (40 points total)
    if (!result.metrics.dataLoss) scenarioScore += 10;
    if (result.metrics.gracefulDegradation) scenarioScore += 10;
    if (result.metrics.stateConsistency) scenarioScore += 10;
    if (result.metrics.sessionsRecovered >= result.metrics.sessionsAffected / 2) scenarioScore += 10;

    totalScore += scenarioScore;
  }

  return (totalScore / (results.length * 100)) * 100;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
runChaosTests().catch(console.error);
