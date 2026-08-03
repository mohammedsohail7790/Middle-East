# Call IQ Gateway - Testing Infrastructure

Comprehensive testing framework for validating production readiness, reliability, and operational confidence.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Test Categories](#test-categories)
- [Quick Start](#quick-start)
- [Integration Tests](#integration-tests)
- [Load Testing](#load-testing)
- [Chaos Engineering](#chaos-engineering)
- [Synthetic Callers](#synthetic-callers)
- [Reliability Scoring](#reliability-scoring)
- [CI/CD Integration](#cicd-integration)

---

## Overview

The Call IQ testing infrastructure provides:

- **50+ Integration Tests** - Validate critical paths
- **5 Load Simulators** - Stress test under various conditions
- **10 Chaos Scenarios** - Validate resilience and recovery
- **9 Synthetic Callers** - End-to-end conversation testing
- **Automated Reliability Scoring** - Deployment readiness gates

**Total:** 28 files, ~9,050 lines of production test code

---

## Test Categories

### 1. Integration Tests (`integration/`)
- Session lifecycle (14 tests)
- Audio pipeline (14 tests)
- Tool execution (12 tests)
- Redis coordination (10 tests)

### 2. Load Testing (`load/`)
- Concurrent call simulation (10-100+ calls)
- Reconnect storm simulator
- Packet loss simulator
- Jitter injector
- Memory pressure simulator

### 3. Chaos Engineering (`chaos/`)
- Redis failures
- OpenAI disconnects
- Twilio failures
- Network degradation
- Resource exhaustion

### 4. Synthetic Callers (`synthetic-callers/`)
- 9 caller personalities
- Booking flow scenarios
- Concurrent execution
- Metrics collection

### 5. Reliability Scoring (`reliability/`)
- Automated health scoring
- Regression detection
- Deployment gates

---

## Quick Start

### Prerequisites

```bash
# Install dependencies
npm install

# Set environment variables
export GATEWAY_URL=ws://localhost:3003
export TEST_TENANT_ID=your-tenant-id
export REDIS_URL=redis://localhost:6379
```

### Run All Tests

```bash
# Run complete test suite
npm run test:all

# Run specific category
npm run test:integration
npm run test:load
npm run test:chaos
npm run test:synthetic
```

---

## Integration Tests

### Overview

Integration tests validate critical system paths including session lifecycle, audio pipeline, tool execution, and Redis coordination.

**Files:** 4  
**Tests:** 50+  
**Coverage:** 100% of critical paths

### Run Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test suite
npm run test:integration -- session-lifecycle
npm run test:integration -- audio-pipeline
npm run test:integration -- tool-execution
npm run test:integration -- redis-coordination

# Run with coverage
npm run test:integration:coverage
```

### Test Suites

#### Session Lifecycle (`session-lifecycle.test.ts`)
- Session creation and registration
- Session recovery after disconnect
- Reconnect handling
- Stale session cleanup
- Deterministic shutdown
- Orphan session adoption
- Redis ownership transfer
- No listener leaks

#### Audio Pipeline (`audio-pipeline.test.ts`)
- Bidirectional audio forwarding
- Packet ordering validation
- Interruption handling
- Silence behavior
- Backpressure handling
- Malformed frame handling
- Audio queue depth monitoring
- Latency tracking

#### Tool Execution (`tool-execution.test.ts`)
- Success paths for all tools
- Timeout handling
- Retry logic
- Concurrent execution
- Idempotency validation
- Circuit breakers
- Cleanup correctness

#### Redis Coordination (`redis-coordination.test.ts`)
- Distributed locking
- Lease renewal
- Ownership transfer
- Failover recovery
- Cleanup propagation
- Reconnect synchronization
- Multi-instance coordination

### Expected Results

- **Pass Rate:** >95%
- **Execution Time:** ~5-10 minutes
- **Coverage:** 100% of critical paths

---

## Load Testing

### Overview

Load testing framework for validating concurrent call capacity, resource usage, and performance under stress.

**Files:** 1  
**Simulators:** 5  
**Capacity:** 100+ concurrent calls

### Run Load Tests

```bash
# Basic load test (10 concurrent)
npm run test:load -- --concurrent=10 --duration=60

# High load test (100 concurrent)
npm run test:load -- --concurrent=100 --duration=300

# Reconnect storm
npm run test:load:reconnect -- --intensity=10 --duration=60

# Packet loss simulation
npm run test:load:packet-loss -- --loss-rate=0.1 --duration=60

# Jitter injection
npm run test:load:jitter -- --base-latency=50 --jitter=20 --duration=60

# Memory pressure
npm run test:load:memory -- --target-mb=500 --duration=60
```

### Load Test Configuration

```typescript
{
  gatewayUrl: 'ws://localhost:3003',
  tenantId: 'test-tenant-id',
  concurrentCalls: 100,
  duration: 300, // seconds
  rampUpTime: 30, // seconds
  callDuration: 60, // seconds per call
  audioFrameRate: 50 // frames per second
}
```

### Metrics Collected

- **Connection Metrics:** Total, successful, failed, active
- **Performance Metrics:** Latency (avg, P50, P95, P99, max)
- **Resource Metrics:** CPU, memory, event loop lag
- **WebSocket Metrics:** Count, dropped sessions, reconnects
- **Audio Metrics:** Frames sent/received, dropouts
- **Throughput:** Calls/sec, frames/sec

### Expected Results (100 Concurrent)

- **Success Rate:** >99%
- **P95 Latency:** <1000ms
- **CPU Usage:** <70%
- **Memory Growth:** <500MB
- **Event Loop Lag:** <50ms

---

## Chaos Engineering

### Overview

Chaos engineering framework for testing system resilience through controlled failure injection.

**Files:** 2  
**Scenarios:** 10  
**Failure Types:** 6

### Run Chaos Tests

```bash
# Run all chaos scenarios
npm run test:chaos

# Run specific scenario
npm run test:chaos -- --scenario="Redis Connection Loss"

# Run with custom intensity
npm run test:chaos -- --intensity=high
```

### Chaos Scenarios

#### 1. Redis Connection Loss
- **Duration:** 30s
- **Intensity:** Medium
- **Expected:** Auto-reconnect within 5s, no data loss

#### 2. Redis Data Loss
- **Duration:** 10s
- **Intensity:** Critical
- **Expected:** Graceful degradation, state rebuild

#### 3. OpenAI WebSocket Disconnect
- **Duration:** 20s
- **Intensity:** High
- **Expected:** Auto-reconnect within 3s, session preserved

#### 4. Twilio Media Stream Failure
- **Duration:** 15s
- **Intensity:** High
- **Expected:** Graceful termination, proper cleanup

#### 5. Network Degradation
- **Duration:** 60s
- **Intensity:** Medium
- **Expected:** Packet loss tolerance, acceptable latency

#### 6. Network Partition
- **Duration:** 30s
- **Intensity:** Critical
- **Expected:** Graceful timeout, recovery after heal

#### 7. Memory Pressure
- **Duration:** 30s
- **Intensity:** High
- **Expected:** GC triggers, no OOM, stable sessions

#### 8. CPU Spike
- **Duration:** 20s
- **Intensity:** High
- **Expected:** Event loop responsive, no timeouts

#### 9. Event Loop Exhaustion
- **Duration:** 15s
- **Intensity:** Critical
- **Expected:** Backpressure, graceful rejection

#### 10. Database Connection Loss
- **Duration:** 25s
- **Intensity:** Medium
- **Expected:** Cached operation, auto-reconnect

### Resilience Score

Calculated based on:
- Success/failure (40 points)
- System recovery (20 points)
- No data loss (10 points)
- Graceful degradation (10 points)
- State consistency (10 points)
- Session recovery (10 points)

**Target:** >90% resilience score

---

## Synthetic Callers

### Overview

End-to-end conversation testing with realistic caller personalities and scenarios.

**Files:** 16  
**Personalities:** 9  
**Scenarios:** 3+

### Run Synthetic Caller Tests

```bash
# Single test
npm run test:synthetic:single

# Batch tests (all personalities)
npm run test:synthetic:batch

# Load test (100 concurrent)
npm run test:synthetic:load 100

# Complete suite
npm run test:synthetic:all
```

### Caller Personalities

1. **Booking-Focused** - Direct, efficient booking
2. **Angry Customer** - Frustrated, demanding
3. **Confused Customer** - Needs clarification
4. **Interrupt-Heavy** - Frequent interruptions
5. **Fast Talker** - Rapid speech
6. **Elderly Caller** - Slow, needs repetition
7. **Noisy Environment** - Background noise
8. **Price Shopper** - Cost-focused
9. **Emergency Caller** - Urgent, stressed

### Test Scenarios

- **Booking Flow** - Complete appointment booking
- **Quick Booking** - Minimal conversation
- **Detailed Booking** - Complex requirements

### Success Criteria

- Booking created
- Lead captured
- Duration < target
- No zombie sessions

---

## Reliability Scoring

### Overview

Automated health scoring system with regression detection and deployment gates.

**Files:** 1  
**Components:** 6  
**Metrics:** 12+

### Run Reliability Scoring

```bash
# Calculate current score
npm run reliability:score

# Check for regressions
npm run reliability:regression

# View score history
npm run reliability:history -- --hours=24
```

### Score Components

1. **Session Stability** (25% weight)
   - Session failure rate
   - Zombie session rate
   - Orphan session rate

2. **WebSocket Health** (20% weight)
   - Connection failure rate
   - Reconnect rate

3. **Audio Quality** (20% weight)
   - Latency P95
   - Dropout rate
   - Jitter

4. **Tool Reliability** (15% weight)
   - Success rate
   - Timeout rate
   - Latency P95

5. **Latency Health** (15% weight)
   - Redis latency
   - OpenAI latency
   - OpenAI error rate

6. **Resource Health** (5% weight)
   - Memory usage
   - Event loop lag
   - CPU usage

### Grading Scale

- **A+:** 97-100 (Excellent)
- **A:** 90-96 (Very Good)
- **B:** 80-89 (Good)
- **C:** 70-79 (Fair)
- **D:** 60-69 (Poor)
- **F:** 0-59 (Failing)

### Deployment Gates

**Requirements:**
- Overall score >= 85
- Session stability >= 80
- WebSocket health >= 80
- Audio quality >= 75

**Status:** ✅ APPROVED or ❌ BLOCKED

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm run test:integration

  load:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm run test:load -- --concurrent=50 --duration=120

  chaos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm run test:chaos

  reliability:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm run reliability:score
      - run: npm run reliability:regression
```

### Pre-Deployment Checklist

```bash
#!/bin/bash

# Run all tests
npm run test:all

# Check reliability score
SCORE=$(npm run reliability:score --silent | grep "Overall:" | awk '{print $2}')

if [ "$SCORE" -lt 85 ]; then
  echo "❌ Deployment blocked: Reliability score too low ($SCORE < 85)"
  exit 1
fi

# Check for regressions
npm run reliability:regression

echo "✅ All checks passed - Ready for deployment"
```

---

## Troubleshooting

### Common Issues

#### Tests Timing Out
```bash
# Increase timeout
npm run test:integration -- --timeout=60000
```

#### Connection Refused
```bash
# Ensure gateway is running
npm run dev

# Check gateway URL
echo $GATEWAY_URL
```

#### Redis Connection Failed
```bash
# Ensure Redis is running
redis-cli ping

# Check Redis URL
echo $REDIS_URL
```

#### High Memory Usage
```bash
# Run with memory profiling
node --expose-gc --max-old-space-size=4096 tests/load/run-load-tests.ts
```

---

## Best Practices

### 1. Run Tests Locally Before Push
```bash
npm run test:integration
npm run reliability:score
```

### 2. Monitor Resource Usage
```bash
# Watch memory during tests
watch -n 1 'ps aux | grep node'
```

### 3. Review Test Reports
```bash
# Generate HTML report
npm run test:integration -- --reporter=html
```

### 4. Update Baselines After Major Changes
```bash
npm run reliability:baseline:update
```

### 5. Run Chaos Tests in Staging
```bash
# Never run chaos tests in production!
NODE_ENV=staging npm run test:chaos
```

---

## Contributing

### Adding New Tests

1. Create test file in appropriate directory
2. Follow existing test patterns
3. Add npm script to `package.json`
4. Update this README
5. Run full test suite

### Test Naming Conventions

- Integration: `*.test.ts`
- Load: `*-simulator.ts` or `*-framework.ts`
- Chaos: `*-scenario.ts` or `*-framework.ts`
- Synthetic: `*-personality.ts` or `*-scenario.ts`

---

## Support

For issues or questions:
- Check troubleshooting section
- Review test logs
- Contact DevOps team

---

**Last Updated:** May 13, 2026  
**Version:** 2.0  
**Status:** ✅ Production Ready
