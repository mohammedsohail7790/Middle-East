# Call IQ V4 — Enterprise Cognitive Communications Infrastructure

**Codename:** CALL IQ V4  
**Evolution:** AI Receptionist SaaS → Enterprise AI Communications Operating System

## Vision

A multi-tenant, event-driven, AI-governed platform for real-time voice, scheduling, CRM sync, and operational intelligence — designed for thousands of tenants, concurrent realtime sessions, compliance readiness, and future autonomous agents.

## Phase map

| Phase | Priority | Focus | Status |
|-------|----------|-------|--------|
| **P0** | Blocker | Zero-trust tenant isolation, WS auth, RLS, API hardening | **In progress** (this commit) |
| **P1-A** | High | Runtime session authority, reconnect grace, partial persistence | **In progress** |
| **P1-B** | Medium | Audio resilience, advanced repair (out of P1-A scope) | Planned |
| **P2** | High | Redis Streams event bus, async consumers, DLQ | **In progress** |
| **P3** | Medium | AI governance, tool policy, guardrails, execution audit | **In progress** |
| **P4** | Medium | Pino/OTel, metrics, ops dashboard | Planned |
| **P5** | Medium | RBAC, SSO/SCIM, audit immutability, public API platform | Partial (routes exist) |
| **P6** | Future | Memory graph, quality intelligence, autonomous agents | Planned |
| **P8** | Ops | Docker, IaC, multi-env CI/CD | Partial |
| **P9** | UX | Enterprise command-center dashboard | Planned |
| **P10** | Hygiene | Remove legacy frontends, standardize DTOs | Planned |

## Target architecture

```
                    ┌─────────────────────────────────────────┐
                    │           Enterprise Dashboard           │
                    │  (Next.js — command center, RBAC, ops)   │
                    └─────────────────┬───────────────────────┘
                                      │ Bearer JWT only (V4)
                                      ▼
┌──────────┐   webhooks    ┌────────────────────────────────────────┐
│  Twilio  │──────────────►│           Call IQ Gateway (Node)          │
└──────────┘   WSS+JWT     │  ┌─────────────┐  ┌──────────────────────┐ │
                           │  │ require-    │  │ RealtimeGateway       │ │
                           │  │ tenant      │  │ + SessionManager (P1) │ │
                           │  └─────────────┘  └──────────────────────┘ │
                           │  ┌─────────────┐  ┌──────────────────────┐ │
                           │  │ Event Bus   │  │ AI Governance (P3)    │ │
                           │  │ (P2)        │  │ Tool policy engine    │ │
                           │  └─────────────┘  └──────────────────────┘ │
                           └───────┬────────────────────┬───────────────┘
                                   │                    │
                           ┌───────▼───────┐    ┌───────▼───────┐
                           │ Postgres      │    │ Redis         │
                           │ (Supabase)    │    │ sessions/queue│
                           └───────────────┘    └───────────────┘
```

## P0 implementation (current)

### Server-side tenant authority

| Module | Path |
|--------|------|
| Tenant context types | `apps/gateway/src/services/auth/tenant-context.ts` |
| JWT tenant verification | `apps/gateway/src/services/auth/jwt-tenant-verifier.ts` |
| Internal service auth | `apps/gateway/src/services/auth/internal-service-auth.ts` |
| Middleware | `apps/gateway/src/middleware/require-tenant.ts` |
| Legacy bridge | `apps/gateway/src/services/auth/resolve-tenant.ts` |

**Rules:**

- External `x-tenant-id` is **ignored** for user Bearer auth; tenant comes only from verified JWT claims.
- `req.tenant` is authoritative; `resolvedTenantId` kept for backward compatibility.
- Internal calls use `x-internal-api-key` + required `x-tenant-id` with scope validation.

### WebSocket security

| Module | Path |
|--------|------|
| Signed session JWTs | `apps/gateway/src/services/auth/ws-session-tokens.ts` |
| Legacy hex tokens | `apps/gateway/src/services/voice/ws-stream-auth.ts` (compat) |

**Rules:**

- Short-lived signed tokens bind `tenantId`, optional `callSid`, `jti` nonce in Redis.
- Replay: nonce consumed on first successful verify (configurable).
- Realtime connection rejects invalid tokens before session start.

### API middleware

| Module | Path |
|--------|------|
| Request tracing | `apps/gateway/src/middleware/request-tracing.ts` |
| Tenant rate limits | `apps/gateway/src/middleware/rate-limit.ts` |
| API scopes | `apps/gateway/src/middleware/api-scopes.ts` |

### Database

| Migration | Path |
|-----------|------|
| RLS hardening | `supabase/migrations/029_rls_hardening.sql` |

### Dashboard client

- Browser sends **Authorization only** (no client-authoritative `x-tenant-id`).

## Environment flags

| Variable | Default | Purpose |
|----------|---------|---------|
| `CALLIQ_V4_ZERO_TRUST` | `true` in production | Strict JWT tenant; ignore client tenant header |
| `WS_SESSION_SECRET` | falls back to `JWT_SECRET` | Sign WS session JWTs |
| `WS_SESSION_TTL_SEC` | `7200` | Stream session lifetime |
| `WS_NONCE_REPLAY_GUARD` | `true` | One-time nonce in Redis |
| `CALLIQ_V4_VALIDATION_LOGS` | `true` (48–72h) | `V4_AUTH_RESOLUTION`, `V4_TENANT_SHADOW_MISMATCH`, `V4_WS_SESSION`, `V4_APPOINTMENT_WRITE` |

### Validation window telemetry (post-P0)

Structured logs for production soak (disable with `CALLIQ_V4_VALIDATION_LOGS=false`):

| Log key | Purpose |
|---------|---------|
| `V4_AUTH_RESOLUTION` | requestId, route, tenantId, source, status |
| `V4_TENANT_SHADOW_MISMATCH` | Client `x-tenant-id` hint ≠ JWT tenant (stale clients) |
| `V4_WS_SESSION` | token issue/verify, nonce, upgrade accept/reject |
| `V4_APPOINTMENT_WRITE` | create/reschedule/cancel with calendar sync hint |
| `V4_QUEUE_DISPATCH` | integration job start (correlated) |

All V4 logs include correlated fields when available: `requestId`, `tenantId`, `userId`, `callSid`, `wsSessionId`, `sessionId` (via `correlation-context.ts` + AsyncLocalStorage).

| `V4_SESSION_FANOUT_ANOMALY` | Same `callSid` → multiple `wsSessionId` within 5m (may be sequential reconnects) |
| `V4_SESSION_OVERLAP_ANOMALY` | Same `callSid` with **simultaneously active** transports (`overlapMs`, `transportAgeMs`, `otherTransportAgeMs`) — split-authority risk |

**Soak pattern:** `V4_SESSION_FANOUT_ANOMALY` without `V4_SESSION_OVERLAP_ANOMALY` → likely benign reconnect churn. Both together → investigate before P1-A.

**Soak alert:** `successful UI` + no `V4_APPOINTMENT_WRITE` for the same tenant/time → investigate swallowed writes or RLS.

## Event catalog (P2)

See `infrastructure/events/event-types.ts` for canonical event names:

`CALL_STARTED`, `CALL_CONNECTED`, `TRANSCRIPT_UPDATED`, `TOOL_EXECUTED`, `LEAD_CREATED`, `APPOINTMENT_BOOKED`, `APPOINTMENT_RESCHEDULED`, `SMS_SENT`, `CRM_SYNCED`, `CALL_ENDED`, `BILLING_UPDATED`.

## P1-A — Runtime continuity (in progress)

**Invariant:** Calls = durable `CallRuntimeSession`; WebSocket/Twilio/OpenAI = replaceable transports.

| Module | Path |
|--------|------|
| Runtime authority | `apps/gateway/src/services/realtime/realtime-session.ts` |
| Registry | `apps/gateway/src/services/realtime/session-registry.ts` |
| Watchdog | `apps/gateway/src/services/realtime/session-watchdog.ts` |
| Redis continuity | `apps/gateway/src/services/realtime/realtime-session-redis.ts` |
| Partial persistence | `apps/gateway/src/services/realtime/session-persistence.ts` |
| Lifecycle telemetry | `apps/gateway/src/services/realtime/session-lifecycle-telemetry.ts` |
| Idempotency | `apps/gateway/src/services/realtime/session-idempotency.ts` |

| Env | Default | Purpose |
|-----|---------|---------|
| `CALLIQ_P1_RUNTIME_SESSION` | enabled (`!== 'false'`) | Feature gate |
| `P1_RECONNECT_GRACE_MS` | `15000` | Defer terminate after transport drop |
| `P1_PERSISTENCE_INTERVAL_MS` | `30000` | Redis transcript continuity flush |
| `P1_SESSION_HEARTBEAT_STALE_MS` | `120000` | Watchdog stale threshold |
| `V4_OVERLAP_MIN_MS` | `50` | Concurrent transport overlap |

Lifecycle logs: `SESSION_CREATED`, `SESSION_ATTACHED`, `SESSION_REATTACHED`, `SESSION_RECONNECTING`, `SESSION_TERMINATED`, `SESSION_PERSISTENCE_FLUSH`, `SESSION_WATCHDOG_CLEANUP`.

## P2 — Event-driven backbone (in progress)

Redis Streams (`calliq:stream:*`) with consumer group `calliq-platform`.

| Module | Path |
|--------|------|
| Envelope | `infrastructure/events/event-envelope.ts` |
| Types / streams | `infrastructure/events/event-types.ts` |
| Bus | `infrastructure/events/event-bus.ts` |
| Publisher / consumer / DLQ | `infrastructure/events/event-*.ts` |
| Gateway wiring | `apps/gateway/src/events/` |
| Consumers | `apps/gateway/src/events/consumers/` |

| Env | Default | Purpose |
|-----|---------|---------|
| `CALLIQ_P2_EVENT_BUS` | enabled | Master gate |
| `CALLIQ_P2_CONSUMERS` | enabled | Consumer poll loop |
| `CALLIQ_P2_ASYNC_INTEGRATIONS` | `false` | Phase 3: CRM via consumer only |
| `CALLIQ_P2_ASYNC_AUTOMATION` | `false` | Phase 3: follow-up via consumer |
| `CALLIQ_P2_ASYNC_NOTIFICATIONS` | `false` | Phase 3: Slack via consumer |
| `CALLIQ_P2_SHADOW_VERIFY` | `false` | Consumer shadow mode: log async payload, suppress side effects; compare to `P2_SHADOW_VERIFY_SYNC` |

**Migration:** Phase 1 publishes alongside sync paths (current). Enable async flags per workflow after soak.

**Ops:** `GET /metrics/events` — stream depth, DLQ count, bus counters.

Telemetry: `EVENT_PUBLISHED`, `EVENT_CONSUMED`, `EVENT_RETRY`, `EVENT_DLQ`.

## P3 — AI runtime governance (in progress)

| Module | Path |
|--------|------|
| Governance orchestrator | `apps/gateway/src/services/ai-governance/ai-governance.service.ts` |
| Tool policies | `tool-policy-engine.ts` |
| Permissions / risk / guardrails | `runtime-permissions.ts`, `execution-risk.ts`, `execution-guardrails.ts` |
| Audit | `execution-audit.ts` |
| DB config | `supabase/migrations/030_ai_governance_config.sql` |

Pipeline: `executeTool` → governance → policy → risk → guardrails → authorize → `executeToolDirect` → audit + events.

| Env | Default | Purpose |
|-----|---------|---------|
| `CALLIQ_P3_GOVERNANCE` | enabled | Mediate all tool calls |
| `CALLIQ_AI_EMERGENCY_DISABLE` | `false` | Platform-wide tool kill switch |

Events: `AI_TOOL_AUTHORIZED`, `AI_TOOL_DENIED`, `AI_TOOL_EXECUTED`, `AI_TOOL_FAILED`, `AI_RUNTIME_GUARDRAIL_TRIGGERED`.

Ops: `GET /metrics/ai`, `GET /internal/ai-governance` (optional `x-internal-api-key`).

## Next engineering sprints

1. **P1-B** — Audio resilience (jitter/repair) after P1-A soak green.
2. **P2 soak** — Enable `CALLIQ_P2_ASYNC_*` after shadow verification parity.
3. **P3 soak** — Tune policies per tenant; watch `AI_POLICY_DENY` / guardrail rates.
4. **P4** — Replace Winston with Pino + OpenTelemetry exporters.
5. **P5** — Enforce RBAC on dashboard routes; complete SSO controllers.

## Success criteria (V4 GA)

- [ ] Pen test: no cross-tenant IDOR on API or Supabase anon client
- [ ] WS cannot connect without valid signed session
- [ ] All P0 integration tests green
- [ ] Event bus handles 100% post-call side effects
- [ ] p99 voice connect latency &lt; 2s under load test
- [ ] SOC2-ready audit log immutability

---

*This document is the master plan; implementation lands incrementally on `main` with feature flags.*
