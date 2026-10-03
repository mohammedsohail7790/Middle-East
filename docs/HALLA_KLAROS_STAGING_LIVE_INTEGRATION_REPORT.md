# Halla ↔ Klaros — Staging / Live Integration Report

Date: 2026-10-03 · HEAD `d06db8eb55292e4bb6f00fc5dd590ce2c6c82b69` · branch `main` · package version 1.0.0 · migration head `070_klaros_integration.sql`

**Final verdict: NOT READY** — by this task's own rule ("staging deployment failed / migration 070 cannot be applied"): the staging deployment **could not be performed**, so no staging-side behaviour was verified. The Halla *source* is validated; the *deployment* does not exist.

Classification legend: **REAL** · **MOCKED** · **SKIPPED** · **FAILED** · **ENVIRONMENT-BLOCKED**. No secret appears in this document.

## 1. Executive summary
Everything verifiable without a deployed staging environment passes against real Redis 7.4.11 and PostgreSQL 16.15. Every phase that needs a deployed staging gateway, staging database, test tenant, API key, webhook secret or Klaros staging URL is ENVIRONMENT-BLOCKED. Nothing was fabricated; no production system was mutated.

## 2. Initial state
Integration code exists locally (uncommitted: 24 modified, 33 untracked at session end). Production `gateway.hallaai.com` is healthy but runs a pre-Klaros build (proved earlier: identical 401 for Klaros routes and a nonexistent route; HEAD contains no Klaros files). No tenant, key, secret or Klaros URL available.

## 3. Final state
Unchanged except two new docs. No source modified. Deployment, tenant, key, webhook: still absent.

## 4. Staging deployment — ENVIRONMENT-BLOCKED
Reasons (each verified):
- `git ls-remote origin` lists only `main`; **no `staging` branch exists**. Render deploys from git, and creating/pushing a branch is forbidden by this task (no add/commit/push). The Render CLI and Supabase CLI are not installed; no hosting or database credentials are present in the process environment (`.env` is deny-listed and was not read).
- The root `render.yaml` (the one in use) defines only the production service `halla-ai-gateway` (`autoDeploy: true` from main). The staging service in `infrastructure/deployment/render.yaml` (`halla-ai-gateway-staging`, branch `staging`, `staging.calliq.ai` origins) is a legacy template; there is no evidence it was ever created, and it does not define the Halla database/Supabase variables.
- Deploying to `main` would deploy production, which is prohibited.

## 5. Staging URL — NOT AVAILABLE
`gateway.staging.hallaai.com` and `staging.hallaai.com` both return **NXDOMAIN** (queried via 8.8.8.8). The hostname is a template value only. No other staging hostname exists in configuration; none was invented.

## 6. DNS/TLS
Production only (REAL): DNS resolves via Cloudflare to Render; cert CN `gateway.hallaai.com`, valid to 2026-11-17; `/health` and `/ready` 200. Staging: ENVIRONMENT-BLOCKED (no DNS).

## 7. Migration 070
- File validation: **REAL pass** — `validate-migrations.mjs`: 70 migrations, no duplicates.
- Clean apply: **REAL pass** on throw-away PostgreSQL 16.15 (schema.sql + all 70 migrations, 70/70) with a test-only Supabase shim.
- Staging / production database: **ENVIRONMENT-BLOCKED** (no staging DB identified or credentialed; production DB must not be touched). Deployed state: UNKNOWN.

## 8. Test tenant — ENVIRONMENT-BLOCKED
No existing test tenant, seed or supported admin provisioning path reachable without a deployed staging database. `HALLA_TEST_TENANT_ID`: NOT AVAILABLE.

## 9. API-key authentication
- Header (SOURCE, REAL in tests): `Authorization: Bearer sk_calliq_…`. **Not verified against a deployed build** (none exists). Production's older build does not implement it.
- Key issuance/validation/revocation/wrong-tenant/default-deny: REAL against PostgreSQL 16 (`klaros-postgres`, `api-key-route-matrix`). Live key: ABSENT.
- `API_KEY = NOT AVAILABLE`

## 10–13. Workforce / Agents / Lead create-update / klarosLeadId
Authenticated live calls: **ENVIRONMENT-BLOCKED**. Contract verified REAL against PostgreSQL 16 and the real router (workforce GET/PUT, agents without `systemPrompt`/`transferNumber`, `POST /leads` + `PUT /leads/:id` with camelCase `klarosLeadId`, tenant preserved, no duplicate).

## 14–16. Webhook registration / signature / real webhook
Registration against a deployed gateway and delivery to a Klaros staging URL: **ENVIRONMENT-BLOCKED** (no gateway, no tenant, no Klaros staging URL). Signature contract: SOURCE + REAL in tests — `X-HallaAI-Signature: sha256=<hex>`, `X-HallaAI-Timestamp` (epoch seconds, ±300 s), HMAC-SHA256 over `"<timestamp>.<raw body>"`; valid/invalid/stale/modified-body verified in unit tests (REAL crypto, MOCKED transport). Delivery transport in tests is MOCKED.
`WEBHOOK_SECRET = NOT AVAILABLE`

## 17. Qualification ordering / call.completed
REAL (Redis 7.4.11 + PostgreSQL 16.15): qualified+escalated outbound call delivers `lead.qualified` before `call.completed` with correlated ids, signed, tenant-isolated; transient failure retried through Redis with order preserved; permanent failure reaches the DLQ without late arrival; every determination announced with its status (degraded never turned into a verdict); duplicate publication delivered once. Concurrent consumers: REAL. Live staging: ENVIRONMENT-BLOCKED.

## 18. Escalation / 19. Appointment
Escalation (`lead.escalated`, `call.completed.escalation`, single effective execution): REAL in the end-to-end test. Appointment events (`confirmed`/`rescheduled`/`cancelled`): SOURCE + MOCKED/unit; not tested on staging. Known limitation: `call.completed.appointmentId` never populated; `appointment.requested` accepted but never emitted.

## 20. Outbound
Contract verified REAL against PostgreSQL (Twilio MOCKED). **No call placed.** Live outbound test: BLOCKED / not required for the staging handshake.

## 21. Redis retry/DLQ
REAL on Redis 7.4.11: pending reclaim (XCLAIM), exponential backoff, max retries, DLQ `calliq:stream:dlq`, ACK, duplicate suppression, multi-consumer safety (`klaros-event-retry-dlq`, `redis-smoke`). Staging Redis: ENVIRONMENT-BLOCKED.

## 22. Database / RLS
Tenant isolation at the API-key layer: REAL (PostgreSQL). Restricted-role RLS test against a staging DB: ENVIRONMENT-BLOCKED. RLS was not disabled.

## 23. Security
SOURCE-spot-checked this run (REAL code present): default-deny scope policy (`unclassified_route`), SSRF (CGNAT/ULA/mapped ranges, redirects off, HTTPS-only, IP-pinned), agents projection omits sensitive fields, secret returned only on create. Not verified on a deployed host: log-redaction in deployed logs, browser exposure, live TLS to Klaros.

## 24–26. Automated tests / build / audit
| Check | Result | Class |
|---|---|---|
| `tsc --noEmit` (gateway) | 0 errors | REAL |
| ESLint, 29 changed files, `--max-warnings=0` | pass | REAL |
| Gateway build (`node build.cjs`) | pass | REAL |
| Migration validation | 70, no duplicates | REAL |
| Full suite, no infra env | 501 passed, 37 skipped (real-infra suites skip) | REAL/SKIPPED |
| Full suite with real Redis 7.4.11 + PostgreSQL 16.15 | first run **6 failed** / 531 passed; all 6 = `column "config_hash" of relation "calls" does not exist` | FAILED→explained |
| Re-run of the 4 real-infra files after adding that column to the throw-away test DB | 38 passed + 1 expected-fail | REAL |
| `npm audit --audit-level=high` | 22 vulnerabilities (4 moderate, 17 high, 1 critical), pre-existing, no dependency file changed | REAL |

The 6 failures were a **test-scaffolding ordering mistake** (the shim ran before `calls` existed and aborted), not a product defect. `calls.config_hash` is a **pre-existing schema drift**: `voice.controller.ts#storeCall` writes it and no SQL in `supabase/` creates it — so a fresh database built only from the repo's migrations would fail `storeCall`. This should be fixed in a separate migration decided by the owner; I did not add one (outside this task's scope, and it must not be applied to a production history unreviewed). Expected-fail: `ivrService.createAgent/updateAgent` bind a JSON string into `TEXT[]` (pre-existing, recorded).

## 27. Klaros live handshake — ENVIRONMENT-BLOCKED
No Halla staging, no Klaros staging URL, no credentials. Not attempted; nothing faked.

## 28. Environment-blocked items
Staging branch/deploy · staging DNS/TLS · staging DB + migration 070 · staging Redis · test tenant · API key · authenticated health/workforce/agents · live lead create/update · webhook registration · live signed delivery · live ordering/escalation/appointment · live RLS · Klaros handshake.

## 29. Known limitations
`lead.escalated` may arrive after `call.completed` if its first delivery fails; a gateway crash mid post-call drops that call's finalization event; `appointmentId` not populated; `calls.config_hash` drift (above); webhook secret stored plaintext by design.

## 30. Exact next action (requires the owner)
1. Decide and approve: commit the Klaros work and create a `staging` branch (or deploy a separate staging service from the root `render.yaml` pattern), with a **separate staging Supabase project + Redis**. Add a migration for `calls.config_hash` if the owner agrees.
2. Create DNS `gateway.staging.hallaai.com` → the staging service (or tell me the real staging hostname).
3. Apply migrations 001–070 to the staging DB (070 before the code runs).
4. Provide staging credentials through a secret store (or run tenant/key creation yourself in the staging dashboard) and the Klaros staging HTTPS URL.
5. Re-run this task; it will then execute the live sections for real.

Production must not be deployed from this work until staging passes.
