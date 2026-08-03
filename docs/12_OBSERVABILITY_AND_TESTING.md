# 12 — OBSERVABILITY AND TESTING

## Logging

**File:** `apps/gateway/src/services/logger.ts`

- **Library:** Winston
- **Format:** JSON (structured)
- **Output:** stdout (captured by Render)
- **Levels:** error, warn, info, debug
- **Request logging:** Middleware logs method, path, status, duration

## Production Telemetry

**File:** `services/voice/production-telemetry.ts`

Metrics collected:
- Active WebSocket sessions
- Active call SIDs
- Memory usage (RSS, heap)
- CPU usage
- Uptime
- Per-call latency

**Endpoint:** `GET /metrics/production`

## Audio Diagnostics

**File:** `services/realtime/realtime.audio-diag.ts`

Per-session tracking:
- Inbound/outbound frame counts
- Silence frame percentage
- Dropped frame rate
- Average audio levels
- Session duration

**Endpoints:**
- `GET /metrics/audio` — All active sessions
- `GET /debug/audio/:sessionId` — Single session

## Health Checks

| Endpoint | Checks | Response |
|----------|--------|----------|
| `/health` | None (always 200) | `{"status":"ok"}` |
| `/ready` | Database + Redis | 200 or 503 |
| `/voice-health` | Preflight status | 200 or 503 |
| `/health/realtime` | Realtime subsystem | 200 or 503 |

## Error Tracking

### Sentry (Configured, not verified)
- **File:** `apps/gateway/src/observability/sentry.ts`
- **Env:** `SENTRY_DSN`
- Captures uncaught exceptions and unhandled rejections

### Process-Level Error Handling
```typescript
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  logger.error('UNCAUGHT_EXCEPTION', { message: err.message });
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', err.message);
  logger.error('UNHANDLED_REJECTION', { message: err.message });
});
```

## Alerting

**File:** `services/alert-routing.ts`

Configurable alert destinations:
- Slack webhook (`VOICE_ALERT_WEBHOOK_URL`)
- Email (via SMTP)

Alert triggers:
- Error rate exceeds threshold (`VOICE_ALERT_ERROR_RATE_THRESHOLD`)
- Latency exceeds threshold (`VOICE_ALERT_LATENCY_MS_THRESHOLD`)
- Integration failures exceed threshold

## Testing Infrastructure

### Synthetic Callers

**Path:** `apps/gateway/tests/synthetic-callers/`

```bash
npm run test:synthetic        # Run all synthetic tests
npm run test:synthetic:single # Single call test
npm run test:synthetic:batch  # Batch call test
npm run test:synthetic:load   # Load test
npm run test:synthetic:all    # Full suite
```

### Integration Tests

**Path:** `apps/gateway/tests/integration/`

Test files:
- Voice pipeline integration
- Billing flow integration
- Knowledge base integration
- WebSocket connectivity

### Load Testing

**Path:** `apps/gateway/tests/load/`

- `load-test-framework.ts` — Configurable load test runner
- Simulates concurrent calls
- Measures latency under load
- Reports throughput and error rates

### Chaos Testing

**Path:** `apps/gateway/tests/chaos/`

Scenarios:
- Database connection failure
- Redis connection failure
- OpenAI API timeout
- Twilio webhook failure
- Memory pressure
- Network partition simulation

### Test Runner

**Config:** `vitest.config.ts` (root level)
**Framework:** Vitest

## Prometheus Metrics (Configured)

**File:** `apps/gateway/src/observability/prometheus.ts`

Metrics defined (requires `prom-client` package):
- `calliq_calls_total` — Total calls counter
- `calliq_call_duration_seconds` — Call duration histogram
- `calliq_active_sessions` — Active session gauge
- `calliq_errors_total` — Error counter by type
- `calliq_latency_seconds` — Response latency histogram

**Note:** `prom-client` not in dependencies — metrics file has build errors.

## Voice Metrics

**File:** `services/voice/voice.metrics.ts`

Runtime metrics:
- Calls per minute
- Average call duration
- Error rate
- Latency percentiles

## Instrumentation

**File:** `services/voice/instrumentation.ts`

- Memory leak detection (logs every 60s)
- WebSocket connection tracking
- Session lifecycle monitoring

## Operational Health Scoring

**File:** `services/operational-health-scoring.ts`

Composite health score based on:
- Error rate
- Latency
- Uptime
- Resource utilization
- Integration health

## Anomaly Detection

**File:** `services/anomaly-detection.ts`

Detects:
- Unusual call volume spikes
- Latency degradation
- Error rate increases
- Cost anomalies
