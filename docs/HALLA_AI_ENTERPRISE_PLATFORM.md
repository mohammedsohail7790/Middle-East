# Call IQ — Enterprise Platform Completion Roadmap

**Identity:** Enterprise-grade **inbound-only** AI communications operating platform for home-service businesses.

**Foundations shipped (main):** P0 security · P1-A continuity · P2 event bus · P3 AI governance · P4-A/B enterprise ops

**P5 (current):** Production hardening — full observability stack, command center, Grafana/Prometheus, intelligence APIs, retention worker, chaos/replay tests, SSO UX.

This document maps the 20-section “final platform” spec to **phases**, **status**, and **dependencies**.

## Completion matrix

| Section | Capability | Status | Phase |
|---------|------------|--------|-------|
| 1 | Enterprise observability | **P4-A shipped** | 4A |
| 2 | Command center UI | **P4-A + P4-B dashboards** | 4A–4B |
| 3 | RBAC & organizations | **P4-A/B foundation** | 4B |
| 4 | SSO / enterprise auth | **P4-B** (`/enterprise-auth`) | 4B |
| 5 | Immutable audit & compliance | **P4-B** (`/compliance`, audit events) | 4B |
| 6 | Advanced analytics | **P4-B** (`/enterprise-analytics`) | 4B |
| 7 | Call QA | **P4-B** (call quality scores + `/enterprise/quality-scores`) | 4B |
| 8 | Knowledge & memory | Partial (knowledge service) | 5 |
| 9 | Infra hardening | Partial (Docker, compose) | 5 |
| 10 | CI/CD | **CI exists** | 4E |
| 11 | API platform | Partial (api-keys, webhooks) | 4C |
| 12 | Runtime reliability | **P4-B** (`/runtime-reliability`) | 4B |
| 13 | Billing intelligence | **P4-B** (enterprise hub overview) | 4B |
| 14 | Global search | **P4-B** (`/search` + dashboard command search) | 4B |
| 15 | Data lifecycle | Partial (retention controller) | 5 |
| 16 | Dashboard evolution | **P5** command center + SSO UX | 5 |
| 17 | Performance & scale | **P5** HPA scaffold + metrics sync | 5 |
| 18 | Documentation & ops | **P5** runbooks + observability docs | 5 |
| 19 | Testing & chaos | **P5** `tests/chaos`, `tests/replay` | 5 |
| 20 | Final completion gate | Staging validation | GA |

## Non-negotiable invariants (always)

1. Inbound-only — no outbound dialers or cold-call AI  
2. `CallRuntimeSession` is runtime authority  
3. Transports are replaceable  
4. Side effects are event-coordinated  
5. Tools pass through AI governance  
6. Failures are isolated from live calls  
7. Replay-safe consumers and idempotent writes  
8. Absolute tenant isolation  
9. Observability on every critical path  
10. Reliability over novelty  

## Phase 4A (current implementation)

- Unified `/metrics/system`, `/metrics/runtime`  
- `/api/v1/ops/snapshot` — command center feed  
- Prometheus text at `/metrics/prometheus`  
- Ops dashboard `/dashboard/ops`  
- Runtime health score + trace span helpers  

## Phase 4B (shipped — enterprise operations maturity)

**Migration:** `032_enterprise_ops_maturity.sql` (auth sessions, org policies, SCIM, call quality, transcript search index)

**Gateway APIs (JWT + `requireTenant`):**

| Path | Purpose |
|------|---------|
| `/api/v1/enterprise-auth` | Org auth policy, SSO read, sessions, SCIM users, login audit |
| `/api/v1/enterprise-analytics` | Operational score, governance analytics, summary |
| `/api/v1/search` | RBAC-filtered global search (calls, leads, appointments, audit) |
| `/api/v1/compliance` | Retention summary, GDPR export, PII redact, secure delete |
| `/api/v1/runtime-reliability` | Degradation scoring, reconnect quality, watchdog metrics |
| `/api/v1/enterprise` | Unified overview, audit events, quality scores |

**Dashboard:** `/dashboard/governance`, `intelligence`, `quality`, `security`, `compliance` + global command search

- `organizations`, `org_members` (031) + RBAC on ops/governance routes  
- Immutable `enterprise_audit_events`  

## Phase 4C

- SSO hardening (SAML, Entra, Google)  
- SCIM provisioning scaffold  
- API platform quotas + webhook replay  

## Phase 4D

- Analytics engine (conversion, governance, reconnect)  
- QA scoring pipelines → events  
- Billing usage metering dashboards  

## Phase 5 (production hardening — shipped)

- OpenTelemetry-ready trace propagation (`traceparent`, in-process spans)
- `/metrics/topology`, live Prometheus gauge sync, anomaly + alert engine
- `GET /api/v1/intelligence/*` — QA, governance, tenant scoring, diagnostics
- Retention worker (`CALLIQ_RETENTION_WORKER`, `cleanup_retention_data`)
- Command Center UI `/dashboard/command-center`
- Grafana dashboards + Prometheus alert rules
- Chaos/replay vitest suites
- OpenAPI scaffold `apps/gateway/openapi.yaml`

## Phase 5 (scale & GA — remaining)

- K8s production manifests, HPA, Redis HA runbooks  
- Global search index  
- Retention automation  
- Chaos test suite in CI  
- SOC2 / GDPR tooling depth  

## Explicitly out of scope

- Outbound AI / autonomous swarms  
- Multi-region session migration  
- Kafka/NATS (until stream volume requires)  
- Distributed runtime mesh  

## Ops endpoints (P4-A)

| Endpoint | Purpose |
|----------|---------|
| `GET /metrics/system` | Process + gateway + bus aggregate |
| `GET /metrics/runtime` | Sessions, watchdog, reconnect |
| `GET /metrics/events` | Stream depth, DLQ |
| `GET /metrics/ai` | Governance metrics |
| `GET /metrics/prometheus` | Prometheus scrape |
| `GET /api/v1/ops/snapshot` | Command center JSON |
| `GET /api/v1/ops/live-calls` | Active call monitor |

## Environment flags

| Variable | Purpose |
|----------|---------|
| `ENABLE_PUBLIC_METRICS` | Expose metrics in production |
| `CALLIQ_OPS_CENTER` | Enable ops API (default on) |
| `CALLIQ_ENTERPRISE_RBAC` | Enforce DB-backed RBAC |
