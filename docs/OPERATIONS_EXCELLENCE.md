# Call IQ — Operations Excellence (Post-P6 Refinement)

Architecture is complete (P0–P6). This layer tunes alerts, scaling, cost, runtime, intelligence, recovery, and support tooling.

## Alert tuning

- `tuneAlerts()` — deduplication, confidence scoring, noise suppression
- Env: `CALLIQ_ALERT_DEDUPE_MS` (default 5m), `CALLIQ_ALERT_MIN_CONFIDENCE` (0.55)
- API: `GET /api/v1/support/alerts-tuned`

## Scaling & backpressure

- `GET /api/v1/support/scaling-advice` — HPA replica guidance
- `GET /api/v1/support/backpressure` — session pressure level
- `GET /api/v1/support/scale-confidence` — chaos/scale readiness score
- Env: `CALLIQ_BACKPRESSURE_SESSIONS`, `CALLIQ_BACKPRESSURE_CRITICAL`

## Cost refinement

- Weighted 14-day forecast, expensive-call detection, token efficiency score
- `GET /api/v1/billing-intelligence/efficiency`

## Runtime

- Reconnect storm classifier (`reconnect_storm` anomaly)
- Adaptive grace unchanged — P1 authority preserved

## Intelligence (backend only)

- Scoring and recommendations power `/support/diagnostics` and `/operations/*` — no dedicated dashboard routes

## Recovery

- Remediation plans include `confidenceScore` and `requiresApproval`
- POST `/operations/remediation-plan` with `{ "approved": true }` for operator sign-off

## Support

- `GET /api/v1/support/diagnostics` — tenant diagnostics pack
- Dashboard: `/dashboard/support`

## Validation

```bash
npx vitest run tests/validation/scale-resilience.test.ts
npx vitest run tests/chaos tests/replay
bash infrastructure/k8s/stress-testing/run-stress.sh
```
