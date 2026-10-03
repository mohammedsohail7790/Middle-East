# Halla AI — Final Klaros Integration Report

## 1. Executive Summary

Halla is code-complete for the Klaros ↔ Halla integration and has been validated against **real Redis 7.4.11 and real PostgreSQL 16.15**. This phase closed the one remaining ordering defect (`lead.qualified` could be delivered after `call.completed`), populated `escalation` in `call.completed`, removed two unnecessary secret exposures, and audited the API-key default-deny policy against **every route actually registered on the real router (350 routes: 18 reachable by an API key, 332 denied)**.

A real Supabase project was **not** tested: no Supabase credentials exist in this environment (see §9). Nothing was committed or pushed; `HEAD` is unchanged.

**Verdict: READY FOR LIVE KLAROS INTEGRATION — REAL SUPABASE SMOKE TEST PENDING** (§21).

## 2. Initial Git State

- `HEAD`: `d06db8eb55292e4bb6f00fc5dd590ce2c6c82b69`
- Working tree: 22 modified, 28 untracked (the uncommitted work from earlier phases).

## 3. Final Git State

- `HEAD`: `d06db8eb55292e4bb6f00fc5dd590ce2c6c82b69` — **unchanged**. No `git add`, `commit` or `push` was run.
- Working tree: 24 modified files (890 insertions, 157 deletions) and 32 untracked entries (33 new files, because git lists the `services/klaros/` directory as one entry), including this report.

## 4. Completed Integration Blockers

All four were completed in earlier phases and **re-verified in this phase by the full real-infrastructure suite** (§13).

### Redis Retry/Reclaim/DLQ
`XREADGROUP '>'` never re-reads an unacked message, so a failed delivery used to stay pending forever. The consumer now scans the group's pending list with `XPENDING`, makes an entry eligible after an exponential delay (default 10 s doubling to 5 min), reclaims it with `XCLAIM` using that delay as `min-idle-time` (Redis arbitrates concurrent workers), and leaves an entry untouched while its per-event `SET NX` claim shows another worker is still processing it. After `maxRetries` the event goes to `calliq:stream:dlq` and is acked. Configuration: `P2_RETRY_BASE_DELAY_MS`, `P2_RETRY_MAX_DELAY_MS`, `P2_RECLAIM_BATCH`, `P2_RECLAIM_SCAN`, `P2_RECLAIM_INTERVAL_MS`, `P2_CONSUMER_MAX_RETRIES`, `KLAROS_WEBHOOK_MAX_RETRIES` (default 8, about 15 minutes). **Validated on real Redis 7.4.11** (§10).

### API-Key Default-Deny
Enforced at the single choke point in `requireTenant`'s API-key branch via `security/api-key-scope-policy.ts`. Any route not listed is denied. Missing scope → 403, invalid/revoked key → 401, tenant comes only from the key's database row, a mismatching `x-tenant-id` → 403. Dashboard JWT authentication is unchanged. Full matrix in §8.

### SSRF
Webhook URLs must be HTTPS, the host is normalized (case, trailing dots, brackets), literal and DNS-resolved addresses are checked against loopback/private/link-local/CGNAT/ULA/mapped/reserved ranges (every resolved address must be safe), unusual ports are rejected, and validation runs at registration **and on every dispatch**. The request connects only to the validated addresses (defeats DNS rebinding), keeps TLS verification on, and never follows redirects. Transient DNS failures are retried; unsafe destinations are permanent.

### klarosLeadId Correlation
`klarosLeadId` persists on leads and outbound calls (migration 070), and is resolved deterministically into `lead.qualified`, `lead.escalated`, `appointment.*` and `call.completed` via `services/klaros/correlation.ts`. Ambiguous matches resolve to nothing; no ID is ever guessed.

## 5. Qualification / call.completed Ordering

**Original problem.** The previous report listed: "retries can deliver `lead.qualified` after `call.completed`."

**Root cause (reproduced before changing code).** `lead.qualified` and `call.completed` were two independent entries in the same Redis stream, each with its own retry lifecycle. When `lead.qualified`'s delivery failed and `call.completed`'s succeeded, the failed entry stayed pending and was retried later — after `call.completed` had already been delivered. A reproduction test against the old code confirmed the delivery order `call.completed`, then `lead.qualified`.

**Exact fix.** Ordering is guaranteed at the delivery layer, where it can actually be enforced:
1. **One platform event.** `post-call-completion.ts` no longer publishes `lead.qualified` separately. The post-call sequence is: claim → evaluate (45 s timeout) → persist qualification → build the `lead.qualified` payload (only for a real, persisted determination) → read the final persisted state → publish **one** finalization event (`CALL_ENDED`) carrying the final `qualificationStatus` and the `qualificationEvent` payload.
2. **Ordered per-webhook delivery.** `WebhooksService.dispatchKlarosSequence` delivers steps in order, per webhook: a step is attempted only after the earlier steps it subscribes to are delivered. If a later step was already delivered, earlier undelivered steps are **skipped, never sent afterwards** (this also protects manual DLQ replays). Delivery rows are idempotent per `(webhook, event_id)`.
3. **No deadlock.** The consumer tells the handler when this attempt is the last before the DLQ (`meta.finalAttempt`). On the final attempt a failing `lead.qualified` no longer holds back `call.completed`; the failed step stays recorded as undelivered and the event goes to the DLQ for visibility.
4. **Stable ids.** `call.completed` keeps the platform event id; `lead.qualified` uses `<id>:lead.qualified`. Both are identical on every retry.
5. **Never fabricated.** `evaluateCall`'s failure fallbacks used to return `callSuccess: Boolean(phone)`; they are now flagged `degraded` and map to `unknown`. An unknown result is never announced as `lead.qualified`.

**Event ordering.** `lead.qualified` (for `qualified`, `not_qualified` or `needs_human_review`, carrying `status`) is delivered immediately before `call.completed`. For `unknown`, failed or timed-out evaluations only `call.completed` is delivered, with the persisted status.

**Retry behaviour.** A failed `lead.qualified` is retried with exponential backoff while `call.completed` waits. After the final attempt `call.completed` is delivered and nothing is ever delivered late.

**Concurrency behaviour.** The per-event claim lets one worker process an event at a time; racing workers deliver each step exactly once. A worker that crashes between the two steps is recovered by another worker without repeating `lead.qualified`. A crash that leaves the processing claim behind is recovered after the claim lapses.

**Tests.** `klaros-ordered-delivery.test.ts` (13 tests, real consumer + real handler + real service on a Redis-Streams fake): A qualified order; B failing then recovering `lead.qualified` (call.completed waits); C unknown; D permanent failure (completed delivered, qualified never late, DLQ); E duplicates; E2 lost ACK; F concurrent workers; G worker crash between steps; G2 crash leaving the claim; H replay safety; I per-webhook independence; J partial subscriptions; K stable ids. A **mutation check** (removing the ordering guard) turns 5 of them red. The same scenarios run end to end on **real Redis + real PostgreSQL** in `klaros-e2e.integration.test.ts` (§10–11). `post-call-completion.test.ts` (10 tests) covers the orchestrator.

## 6. Event Contract Audit

Envelope for every event: `{ id, type, timestamp, tenant_id, data }`. `id` is stable across retries and is the idempotency key. `timestamp` is the dispatch time. All `data` keys are camelCase; keys with no value are omitted. The envelope was not changed.

| Event | `data` | Notes |
|---|---|---|
| `call.completed` | `callId` (Twilio sid), `durationMs`, `klarosLeadId`, `qualificationStatus`, `escalation` | `qualificationStatus` is the **final persisted** value. **`escalation` is now populated** (see below). Caller phone is never included. `appointmentId` is not populated (no persisted appointment↔call link). |
| `lead.qualified` | `leadId`, `callId`, `klarosLeadId`, `status`, `fields`, `missingFields`, `reason`, `confidence` | Delivered immediately before `call.completed`. `leadId`/`klarosLeadId` present when deterministically resolved. |
| `lead.escalated` | `callId`, `leadId?`, `klarosLeadId?`, `target`, `reason` | Published in real time by the existing `transfer_call` tool. |
| `appointment.confirmed` / `.rescheduled` / `.cancelled` | `appointmentId`, `scheduledTime` (or `reason` for cancel), `leadId?`, `klarosLeadId?` | Correlated via the appointment's phone only when exactly one lead matches. Phone is never included. |

**Escalation decision.** The original integration spec asked `call.completed` to carry "escalation information", and the target is deterministically known when the transfer happens. It was never populated because nothing wrote `calls.transfer_target` (and `storeCall` overwrote it with null). Fix: `transfer_call` records `session.transferTarget`, and post-call passes it to the existing `storeCall` argument. `escalation` is the transferred-to number (string). Verified by a unit test of the tool and, end to end, on real Postgres + Redis.

## 7. Security / Secret Exposure

| Item | Decision | Result |
|---|---|---|
| Webhook signing secret | Needed in plaintext server-side for HMAC, so it cannot be hashed. It is credential material. | **Returned only by `create()`.** `list()` and `update()` never return it. Never logged (tested). |
| Agents endpoint for Klaros | Klaros needs to identify agents, not read prompts or escalation numbers. | Klaros route returns a projection **without** `systemPrompt`, `transferNumber`, `tenantId`; adds `hasTransferNumber`. The dashboard's `/ivr/agents` is unchanged. |
| API-key secret | Only the SHA-256 hash is stored; the raw key is shown once. | Verified on real Postgres; listing never exposes key material. |
| Invalid input errors | Unknown event names and unsafe URLs returned HTTP 500. | Now 400 (`ValidationError`). |

Contract changes to tell Klaros: webhook secret only at creation (recreate the webhook if it is lost; there is no rotate endpoint); the agents shape above.

## 8. API-Key Scope Matrix

Audited against the real router: **350 routes enumerated, 18 reachable by an API key, 332 denied**, with no dead policy entries (`api-key-route-matrix.test.ts`).

| Method | Route | Required scope |
|---|---|---|
| GET | `/api/v1/integrations/klaros/workforce` | `workforce.read` |
| PUT | `/api/v1/integrations/klaros/workforce` | `workforce.write` |
| GET | `/api/v1/integrations/klaros/agents` | `workforce.read` |
| GET | `/api/v1/integrations/klaros/health` | `workforce.read` |
| POST | `/api/v1/leads` | `leads.write` |
| PUT | `/api/v1/leads/:id` (UUID) | `leads.write` |
| GET | `/api/v1/leads`, `/api/v1/leads/:id` | `leads.read` |
| POST | `/api/v1/calls/outbound` | `calls.write` |
| GET | `/api/v1/calls`, `/api/v1/calls/:id` | `calls.read` |
| GET | `/api/v1/appointments`, `/api/v1/appointments/:id` | `appointments.read` |
| GET, POST | `/api/v1/webhooks` | `webhooks.manage` |
| PUT, DELETE | `/api/v1/webhooks/:id` | `webhooks.manage` |
| GET | `/api/v1/webhooks/:id/deliveries` | `webhooks.manage` |

Every other route — including `/dashboard`, `/team`, `/billing`, `/api-keys` (a key can never mint keys), `/knowledge`, `/recordings`, `/webhooks/:id/test`, `/leads/stats` and all PATCH/DELETE on leads — is denied even for a key holding every scope. Path casing, trailing slashes, query strings and the `/api` alias do not bypass it. Forged `x-internal-scopes` / `x-dashboard-role` headers grant nothing. A mismatched `x-tenant-id` → 403; tenant B's key resolves only to tenant B.

## 9. Real Supabase Smoke Test

**ENVIRONMENT BLOCKED.** No Supabase variables (`SUPABASE_*`, `DATABASE_URL`, `GATEWAY_DATABASE_URL`) exist in this environment, and the repository's `.env` is protected from reading by a deny rule, which was respected and not bypassed. No connection to any hosted database was attempted. **Supabase-specific behaviour has not been validated.** The PostgreSQL validation in §11 ran on plain PostgreSQL plus a test-only shim for Supabase platform objects.

## 10. Real Redis Validation

**REAL.** Redis **7.4.11** (Docker, `127.0.0.1:6380`; the machine's own Redis 3.0.504 has no Streams).
- `klaros-event-retry-dlq.test.ts`: **5 / 5 passed** — a failed delivery became pending, was reclaimed after the delay and ACKed; a permanently failing event was bounded and reached the DLQ with its reason; two consumers racing processed a pending entry once; a duplicate event ran the handler once; `XPENDING` showed ownership moving between consumers with the delivery counter incrementing.
- Redis `MONITOR` captured the real commands: 6 `XCLAIM`, 6 `XACK`, 1 DLQ `XADD`.
- `klaros-e2e.integration.test.ts` (**7 / 7 passed**) drives the real consumer against real Redis and real Postgres: ordered delivery, transient retry, permanent failure → DLQ with `call.completed` still delivered, unknown/degraded qualification, duplicate publication, and appointment correlation.
- The 13 deterministic fake-Redis tests remain, and are labelled as fake.

## 11. Real PostgreSQL Validation

**REAL.** PostgreSQL **16.15** (Docker, `pgvector/pgvector:pg16`, `127.0.0.1:5433`) with a **test-only shim** for Supabase platform objects (roles, `auth.users`/`auth.uid()`, `storage` stubs, `supabase_realtime`). Base schema `supabase/schema.sql` then migrations 001–070 applied to an empty database: **all 70 applied cleanly**.
- `klaros-postgres.integration.test.ts`: **24 passed + 1 expected fail** — API-key creation/authentication with scopes as real `text[]` (the old `JSON.stringify` binding is proven to fail), webhook creation with `events[]`/secret persistence, delivery rows and the unique `(webhook_id, event_id)` index, lead persistence with `klarosLeadId`, outbound call insert, `storeCall` preserving `klaros_lead_id`, post-call qualification SQL, correlation queries, workforce GET/PUT on a seeded `ai_agent_configs`, and tenant isolation.
- The shim and the `calls.config_hash` column (§17) exist only in the scratch database.

## 12. Migration Validation

`node scripts/validate-migrations.mjs`: 70 migrations, no duplicates. All 70 apply cleanly on PostgreSQL 16.15 after `schema.sql`. No new migration was added in this phase; migration 070 is idempotent (re-run verified).

## 13. Full Regression

| Run | Files | Tests | Passed | Failed | Skipped | Expected fail |
|---|---|---|---|---|---|---|
| Full suite, **real Redis 7 + real Postgres 16 enabled** | 62 (62 passed) | 538 | 537 | 0 | 0 | 1 |
| Full suite, plain (no Docker) | 62 (59 passed, 3 skipped) | 538 | 501 | 0 | 37 | 0 |

The 37 skipped in the plain run are the real-Redis and real-Postgres suites (5 + 7 + 25), which skip automatically when the infrastructure is absent — never faked. The 1 expected fail is the documented pre-existing `ivrService.createAgent` defect (§17). One flaky-looking failure occurred during this phase (E2E test 2); it was **test pollution** (parallel suites share Redis/Postgres, so another suite's tenant events passed through the E2E consumer and its recording stub), fixed in the test, and the suite then passed in full.

## 14. Typecheck / Lint / Build

- Typecheck (`tsc --noEmit`, gateway): **0 errors**.
- Lint (`eslint --max-warnings=0`, 29 touched `apps/gateway/src` files): **0 warnings**. (`infrastructure/` has no ESLint configuration in the repo, so those files are not linted by any existing setup.)
- Build (`node build.cjs`): **passes** (exit 0).

## 15. Security Tests

All passing in the runs above: API-key authentication, scopes, revoked/expired/unknown keys, cross-tenant access, `x-tenant-id` mismatch, forged internal headers; SSRF across IPv4, IPv6, mapped, DNS, trailing-dot and `*.localhost` names, HTTP rejection, redirect non-following, and registration **and** dispatch enforcement; webhook signing, tamper, wrong-secret and stale-timestamp (replay) rejection; delivery idempotency; webhook-secret and API-key-secret exposure and logging; agent projection exposure; the full route matrix.

## 16. npm Audit

22 vulnerabilities (1 critical, 17 high, 4 moderate). **No dependency file was changed** by this work; the count differs from earlier in the day only because new advisories were published. They are in `next`, `nodemailer` and the eslint / typescript-eslint / `brace-expansion` / `braces` / `micromatch` toolchain. Not remediated (the task excludes dependency upgrades).

## 17. Known Pre-existing Defects

Confirmed, **not** regressions, and deliberately left unfixed (they do not block a Klaros path):
1. `ivrService.createAgent` / `updateAgent` bind `JSON.stringify(services)` into the `TEXT[]` column `ai_agents.services`, so Postgres rejects it. Recorded as an `it.fails` test that turns red once fixed. Klaros only reads agents.
2. `storeCall` writes `calls.config_hash`, which no SQL in the repository creates. It was reproduced on the clean database, where `storeCall` failed with "column does not exist". Confirm production has the column.

## 18. Remaining Limitations

1. **Real Supabase smoke test pending** (§9). Provision a key, register a webhook, send one event, and confirm on the actual project.
2. **Deploy order:** apply migration 070 before deploying this code (lead creation and outbound-call inserts reference the new columns). Nothing in the repo applies migrations automatically.
3. **`lead.escalated` is delivered in real time** as its own event. If its delivery fails and is retried it can arrive after `call.completed`; the same escalation is also in `call.completed.escalation`, so no information is lost.
4. **A gateway crash mid post-call** (during the up-to-45 s evaluation) drops that call's finalization event: the idempotency claim is consumed and nothing re-triggers post-call processing. The ordering guarantee is unaffected (nothing is sent), but the event is not.
5. **`call.completed` timing:** now delayed by the evaluation (up to 45 s, `POST_CALL_EVALUATION_TIMEOUT_MS`), as are other `CALL_ENDED` consumers.
6. **Not exercised for real:** a live Twilio/voice call, a real TLS connection to an external host (transport pinning is tested with a mocked `https` module), and `finalizeRuntimeSession` end to end (its SQL and the tool wiring are tested separately).
7. A tenant's custom webhook `headers` are stored and returned by list (they are not sent by the Klaros dispatcher); they may contain tenant-supplied credentials.
8. Klaros-facing changes to communicate: scopes `leads.read`, `calls.read`, `appointments.read`, `webhooks.manage`; health requires `workforce.read`; the secret and agents changes in §7; `lead.qualified` ids are `<event id>:lead.qualified`.
9. **Environment side effects on the validation machine:** Docker Desktop crashed repeatedly on stale socket files Windows could not delete; they were worked around by *renaming* (not deleting) `%LOCALAPPDATA%\Docker\run*` and `docker-secrets-engine*` (the `*.stale-*` folders are safe to delete). Docker Desktop was left running and two images remain pulled. The validation containers were removed.

## 19. Files Changed

**Modified (24):** `apps/gateway/src/` — `events/consumers/index.ts`, `middleware/require-tenant.ts`, `routes/register-api-routes.ts`, `security/ssrf-guard.ts`, `security/validation-schemas.ts`, `services/api-keys/apiKey.service.ts`, `services/appointments/appointment.service.ts`, `services/auth/tenant-context.ts`, `services/leads/{leads-schema,leads.controller,leads.service}.ts`, `services/realtime/{realtime.post-call,realtime.tools,realtime.types}.ts`, `services/voice/{ai.service,outbound.service,voice.controller}.ts`, `services/webhooks/webhooks.service.ts`; `infrastructure/events/{event-bus,event-consumer,event-idempotency,event-router,event-types}.ts`; `tests/unit/gateway/realtime.tools.test.ts`.

**New source (11):** `events/consumers/klaros-webhook.consumer.ts`, `middleware/require-scope.ts`, `security/{api-key-scope-policy,input-validation-error,klaros-event-types,safe-http,webhook-signing}.ts`, `services/klaros/{correlation,klaros.controller}.ts`, `services/realtime/{post-call-completion,qualification-mapper}.ts`.

**New migration (1):** `supabase/migrations/070_klaros_integration.sql`.

**New tests (20 files, including the Redis fake):** `tests/helpers/fake-redis-streams.ts`; integration — `api-key-route-matrix`, `event-consumer-reclaim.fake-redis`, `klaros-e2e.integration`, `klaros-event-retry-dlq`, `klaros-ordered-delivery`, `klaros-postgres.integration`, `klaros-webhook-delivery`, `klaros-workforce-api`; unit — `api-key-service`, `klaros-correlation-and-events`, `klaros-event-types`, `klaros-webhook-signing`, `klaros-workforce-mapping`, `post-call-completion`, `qualification-mapper`, `require-scope`, `require-tenant-api-key`, `safe-http`, `ssrf-guard`.

**New documentation (1):** this report. Klaros was not touched.

## 20. Git Status

`HEAD` `d06db8eb55292e4bb6f00fc5dd590ce2c6c82b69` (unchanged); 24 modified files, 32 untracked entries (33 new files); nothing staged, committed or pushed. The final audit found no `console.log/debug` lines added, no TODO/FIXME, no hardcoded credentials, no disabled security checks, no test-only code in production sources, and no unexpected files (empty stray files created by the search tool were removed).

## 21. FINAL VERDICT

**READY FOR LIVE KLAROS INTEGRATION — REAL SUPABASE SMOKE TEST PENDING**

Every code-level requirement is proven: Redis retry/reclaim/DLQ, default-deny API-key authorization, SSRF hardening, `klarosLeadId` correlation, deterministic qualification ordering (`lead.qualified` can never follow `call.completed`), and secret exposure — all validated on real Redis 7.4.11 and real PostgreSQL 16.15, with typecheck, lint, build and migrations passing and no unexplained failures. The single outstanding item is a smoke test against the real Supabase project, which this environment could not run.
