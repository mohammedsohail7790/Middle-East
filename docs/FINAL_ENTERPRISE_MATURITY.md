# Call IQ — Final Enterprise Maturity (P6)

Inbound-only enterprise operating platform — polish, intelligence, ops automation, and infrastructure scaling.

## Six final domains

| Domain | Delivered |
|--------|-----------|
| **1 — Enterprise UX** | Audit explorer, billing intelligence, compliance, support diagnostics, `useEnterprisePoll` |
| **2 — SSO & identity** | SAML onboarding guides, metadata API, suspicious login detection, SCIM sync worker (`CALLIQ_SCIM_SYNC=true`) |
| **3 — Infrastructure** | K8s autoscaling, consumer HPA, stress script, rollback job |
| **4 — Operational intelligence** | Internal scoring + `/support/diagnostics` (no separate intelligence dashboard) |
| **5 — Billing intelligence** | `/billing-intelligence/forecast`, OpenAI/Twilio split, heatmap, anomalies |
| **6 — Ops automation** | `/operations/*`, self-healing loop, DLQ replay request, remediation plans |

## Post-P6 operations excellence

Tuning layer (alerts, scaling, cost, recovery, support) — see **[OPERATIONS_EXCELLENCE.md](./OPERATIONS_EXCELLENCE.md)**.

```
GET  /api/v1/support/diagnostics
GET  /api/v1/support/alerts-tuned
GET  /api/v1/support/scale-confidence
GET  /api/v1/billing-intelligence/efficiency
GET  /api/v1/compliance/audit-events
```

## Key APIs

```
GET  /api/v1/billing-intelligence/forecast
GET  /api/v1/compliance/audit-events
GET  /api/v1/operations/recovery
POST /api/v1/operations/replay-dlq
POST /api/v1/operations/remediation-plan
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CALLIQ_SELF_HEALING` | true | Ops automation loop |
| `CALLIQ_SCIM_SYNC` | false | SCIM directory reconciliation |
| `CALLIQ_ALERT_WEBHOOK_URL` | — | Critical alert routing |

## Validation

```bash
npx vitest run tests/unit/gateway/final-enterprise.test.ts
npx vitest run tests/chaos tests/replay
bash infrastructure/k8s/stress-testing/run-stress.sh
```

## Invariants (unchanged)

- Inbound-only · `CallRuntimeSession` authority · event-driven workflows · AI governance mandatory · replay-safe · tenant isolated
