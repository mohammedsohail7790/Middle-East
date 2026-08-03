#!/usr/bin/env node
/**
 * Synthetic Caller Test Suite Runner
 * 
 * Comprehensive test suite for Call IQ platform using synthetic callers.
 * Run with: npm run test:synthetic
 */

import { ScenarioRunner } from './framework/scenario-runner.js';
import { bookingFocusedPersonality } from './personalities/booking-focused.js';
import { angryCustomerPersonality } from './personalities/angry-customer.js';
import { confusedCustomerPersonality } from './personalities/confused-customer.js';
import { interruptHeavyPersonality } from './personalities/interrupt-heavy.js';
import { fastTalkerPersonality } from './personalities/fast-talker.js';
import { elderlyCallerPersonality } from './personalities/elderly-caller.js';
import { noisyEnvironmentPersonality } from './personalities/noisy-environment.js';
import { priceShopperPersonality } from './personalities/price-shopper.js';
import { emergencyCallerPersonality } from './personalities/emergency-caller.js';
import { bookingFlowScenario, quickBookingScenario, detailedBookingScenario } from './scenarios/booking-flow.js';

// Configuration
const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:3003';
const TENANT_ID = process.env.TEST_TENANT_ID || 'test-tenant-id';
const DEBUG = process.env.DEBUG === 'true';

/**
 * Main test suite
 */
async function main() {
  console.log('🧪 Call IQ Synthetic Caller Test Suite');
  console.log('=====================================\n');
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log(`Debug: ${DEBUG}\n`);

  const runner = new ScenarioRunner({
    gatewayUrl: GATEWAY_URL,
    tenantId: TENANT_ID,
    debug: DEBUG,
    concurrentLimit: 10,
    retryOnFailure: false,
  });

  // Setup event listeners
  setupEventListeners(runner);

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const mode = args[0] || 'single';

    switch (mode) {
      case 'single':
        await runSingleTest(runner);
        break;

      case 'batch':
        await runBatchTests(runner);
        break;

      case 'load':
        const concurrent = parseInt(args[1]) || 10;
        await runLoadTest(runner, concurrent);
        break;

      case 'all':
        await runAllTests(runner);
        break;

      default:
        console.error(`Unknown mode: ${mode}`);
        console.log('Usage: npm run test:synthetic [single|batch|load|all] [concurrent]');
        process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

/**
 * Run a single test
 */
async function runSingleTest(runner: ScenarioRunner) {
  console.log('📞 Running single test: Booking-Focused Caller\n');

  const result = await runner.runSingle(
    bookingFocusedPersonality,
    bookingFlowScenario
  );

  console.log('\n✅ Test completed');
  console.log(`Success: ${result.success}`);
  console.log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
  console.log(`Turns: ${result.metrics.turnCount}`);
  console.log(`Tool Calls: ${result.metrics.toolCallCount}`);
  console.log(`Interruptions: ${result.metrics.interruptionCount}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach(err => console.log(`  - ${err}`));
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach(warn => console.log(`  - ${warn}`));
  }
}

/**
 * Run batch tests
 */
async function runBatchTests(runner: ScenarioRunner) {
  console.log('📞 Running batch tests: All personalities\n');

  const scenarios = [
    { personality: bookingFocusedPersonality, scenario: bookingFlowScenario },
    { personality: bookingFocusedPersonality, scenario: quickBookingScenario },
    { personality: bookingFocusedPersonality, scenario: detailedBookingScenario },
    { personality: angryCustomerPersonality, scenario: bookingFlowScenario },
    { personality: confusedCustomerPersonality, scenario: bookingFlowScenario },
    { personality: interruptHeavyPersonality, scenario: bookingFlowScenario },
    { personality: fastTalkerPersonality, scenario: bookingFlowScenario },
    { personality: elderlyCallerPersonality, scenario: bookingFlowScenario },
    { personality: noisyEnvironmentPersonality, scenario: bookingFlowScenario },
    { personality: priceShopperPersonality, scenario: bookingFlowScenario },
    { personality: emergencyCallerPersonality, scenario: bookingFlowScenario },
  ];

  const results = await runner.runBatch(scenarios);

  const report = runner.generateReport(results);
  runner.printReport(report);
}

/**
 * Run load test
 */
async function runLoadTest(runner: ScenarioRunner, concurrent: number) {
  console.log(`📞 Running load test: ${concurrent} concurrent calls\n`);

  const startTime = Date.now();

  const results = await runner.runLoadTest(
    bookingFocusedPersonality,
    quickBookingScenario,
    concurrent
  );

  const duration = Date.now() - startTime;

  console.log('\n✅ Load test completed');
  console.log(`Concurrent calls: ${concurrent}`);
  console.log(`Total duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`Passed: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  console.log(`Success rate: ${((results.filter(r => r.success).length / results.length) * 100).toFixed(1)}%`);

  const report = runner.generateReport(results);
  console.log(`\nAverage turn latency: ${report.metrics.averageTurnLatency.toFixed(0)}ms`);
  console.log(`P95 turn latency: ${report.metrics.p95TurnLatency.toFixed(0)}ms`);
  console.log(`P99 turn latency: ${report.metrics.p99TurnLatency.toFixed(0)}ms`);
}

/**
 * Run all tests
 */
async function runAllTests(runner: ScenarioRunner) {
  console.log('📞 Running comprehensive test suite\n');

  // 1. Single tests
  console.log('Phase 1: Single personality tests...');
  await runBatchTests(runner);

  // 2. Load tests
  console.log('\nPhase 2: Load tests...');
  await runLoadTest(runner, 10);
  await runLoadTest(runner, 25);

  // 3. Final report
  const allResults = runner.getResults();
  const finalReport = runner.generateReport(allResults);
  
  console.log('\n' + '='.repeat(80));
  console.log('FINAL COMPREHENSIVE REPORT');
  console.log('='.repeat(80));
  runner.printReport(finalReport);
}

/**
 * Setup event listeners for progress tracking
 */
function setupEventListeners(runner: ScenarioRunner) {
  runner.on('scenario.starting', (data) => {
    console.log(`\n🎭 Starting: ${data.personality} - ${data.scenario}`);
  });

  runner.on('scenario.completed', (data) => {
    const status = data.success ? '✅' : '❌';
    console.log(`${status} Completed: ${data.personality} - ${data.scenario} (${(data.duration / 1000).toFixed(1)}s)`);
  });

  runner.on('scenario.error', (data) => {
    console.log(`❌ Error: ${data.personality} - ${data.scenario}: ${data.error}`);
  });

  runner.on('batch.progress', (data) => {
    console.log(`Progress: ${data.current}/${data.total}`);
  });

  runner.on('engine.connected', (data) => {
    if (DEBUG) {
      console.log(`  Connected: ${data.callSid}`);
    }
  });

  runner.on('engine.user.spoke', (data) => {
    if (DEBUG) {
      console.log(`  User: "${data.text.substring(0, 50)}..."`);
    }
  });

  runner.on('engine.interruption', (data) => {
    if (DEBUG) {
      console.log(`  Interruption #${data.count}: "${data.phrase}"`);
    }
  });

  runner.on('engine.tool.executed', (data) => {
    if (DEBUG) {
      console.log(`  Tool: ${data.name}`);
    }
  });

  runner.on('engine.error', (error) => {
    console.error(`  Error: ${error.message}`);
  });
}

// Run the test suite
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
