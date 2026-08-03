# Incident Response Runbook

## Severity

- **SEV1** — Inbound calls failing for multiple tenants
- **SEV2** — Degraded booking/AI for a tenant cohort
- **SEV3** — Ops/analytics only

## First 15 minutes

1. Open **Command Center** (`/dashboard/command-center`) or `GET /metrics/system`.
2. Check **runtime health**, **active sessions**, **DLQ depth**.
3. Review **alerts** (`GET /api/v1/enterprise/alerts`).
4. Correlate with `X-Request-ID` / `traceparent` in gateway logs.

## Reconnect storm

- Symptom: `calliq_reconnecting_sessions` elevated, reconnect spike alert.
- Action: verify Twilio/WebSocket transport; review `P1_RECONNECT_GRACE_MS`; check client backoff.
- Do **not** restart gateway during active peak unless SEV1.

## DLQ growth

- Symptom: `calliq_dlq_depth` > 25.
- Action: `GET /metrics/events`; inspect failing consumer logs; replay DLQ after fix.
- Governance and CRM consumers are replay-safe.

## AI governance denials

- Symptom: high denial rate alert.
- Action: `GET /metrics/ai` or Governance dashboard; review tenant `ai_agent_configs` and tool policies.

## Tenant isolation breach (P0)

- Stop traffic to affected tenant; rotate JWT secrets; audit `enterprise_audit_events` for scope violations.

## Recovery

- Blue/green: `infrastructure/deployment/blue-green-deploy.sh`
- Rollback: `infrastructure/deployment/rollback-automation.sh`
