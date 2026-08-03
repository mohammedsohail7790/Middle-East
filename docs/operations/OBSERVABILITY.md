# Call IQ — Enterprise Observability

Inbound-only platform observability: request → runtime session → AI governance → event → consumer.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /metrics/system` | Full ops snapshot (JSON) |
| `GET /metrics/runtime` | Active `CallRuntimeSession` list |
| `GET /metrics/events` | Redis Streams + DLQ |
| `GET /metrics/ai` | Governance metrics + recent audit |
| `GET /metrics/topology` | Runtime topology graph + lineage |
| `GET /metrics/prometheus` | Prometheus scrape (live gauges synced on scrape) |

Production: set `ENABLE_PUBLIC_METRICS=true` on the gateway.

## Tracing

- W3C `traceparent` propagated on HTTP responses when `CALLIQ_OTEL_ENABLED=true` (default).
- In-process spans: `http.request`, `event.publish`, `ai.tool.execute`.
- Ops snapshot includes recent spans and anomaly alerts.

## Grafana

Import dashboards from `infrastructure/observability/grafana/`:

- `runtime-continuity.json`
- `ai-governance.json`
- `event-bus.json`
- `calliq-overview.json`

Prometheus config: `infrastructure/observability/prometheus/prometheus.yml`  
Alert rules: `infrastructure/observability/prometheus/alert-rules.yml`

## Command center

Dashboard: `/dashboard/command-center`  
API: `GET /api/v1/enterprise/overview`, `/topology`, `/diagnostics`, `/alerts`
