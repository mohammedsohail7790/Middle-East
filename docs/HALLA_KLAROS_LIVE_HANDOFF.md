# Halla ↔ Klaros Live Handoff

Date: 2026-10-03 · Repo HEAD: `d06db8eb55292e4bb6f00fc5dd590ce2c6c82b69` (branch `main`, 0 commits ahead of origin)

**Verdict: BLOCKED — DEPLOYMENT NOT READY**

Legend: **SOURCE** = verified in working-tree source · **DEPLOYED** = verified against the real deployment · **NOT TESTED** = not exercised.
No secret of any kind appears in this document.

## 1. Executive summary
The integration is implemented and validated against real Redis 7.4 / PostgreSQL 16 (see `HALLA_FINAL_KLAROS_INTEGRATION_REPORT.md`), but **none of it is deployed**. The production gateway runs a build that predates it, there is no test tenant, no API key, no webhook secret and no Klaros staging URL available. No live handshake is possible until the steps in §17 are done.

## 2. Environment
| Item | Value | Status |
|---|---|---|
| Deployment target | Render service `halla-ai-gateway`, `autoDeploy: true` from `main` | SOURCE (`render.yaml`) |
| Public base URL | `https://gateway.hallaai.com` | DEPLOYED (DNS → Cloudflare → Render origin) |
| Staging service | `halla-ai-gateway-staging`, branch `staging` (`infrastructure/deployment/render.yaml`) | SOURCE only |
| Staging URL | `https://gateway.staging.hallaai.com` appears in `.env.staging.template`; DNS lookup timed out | NOT VERIFIED |
| API mount | `/api/v1` and `/api` | SOURCE |

## 3. Verified gateway (production host)
- DNS: resolves (CNAME chain to `middle-east-05u0.onrender.com`). DEPLOYED
- TLS: valid, CN `gateway.hallaai.com`, issuer Google Trust Services (WE1), 2026-08-19 → 2026-11-17. DEPLOYED
- `GET /health` → 200 `{"status":"ok","service":"halla-ai-gateway"}`. DEPLOYED
- `GET /ready` → 200, `ready:true`; database, redis ok. DEPLOYED
- `https://gateway.hallaai.com` is the correct production host. It is **not** a Klaros-capable build (§14).

## 4. API-key header
`Authorization: Bearer <key>` — keys have the prefix `sk_calliq_`. No custom header. Optional `x-tenant-id` must equal the key's tenant or the request gets 403. SOURCE.

## 5. Test tenant
**NO TEST TENANT AVAILABLE.** No tenant id, seed, fixture, or admin provisioning mechanism for a dedicated test tenant was found that could be used safely, and no database credentials exist in this environment. Production tenants were not used. Halla Tenant ID: not available.

## 6. Authentication status
API key: **ABSENT** (none issued for any test tenant; none stored in this environment).
Process environment holds no Halla/Klaros/Supabase/DB variables. `.env` is deny-listed and was not read.
Key issuance path (SOURCE): tenant admin creates a key via `apiKey.service` (`/api/v1/api-keys`, dashboard session only — API keys cannot call it). Raw key is shown once; only its SHA-256 hash is stored in `tenant_api_keys`.

## 7. Workforce contract (SOURCE)
`GET` / `PUT /api/v1/integrations/klaros/workforce`, scopes `workforce.read` / `workforce.write`. Fields: `businessDescription`, `services`, `markets`, `qualificationQuestions`, `requiredCustomerInformation`, `transferConditions`, `operatingInstructions`, `tone`, `personality`.

## 8. Agents contract (SOURCE)
`GET /api/v1/integrations/klaros/agents` (scope `workforce.read`). Output omits `systemPrompt`, `transferNumber`, `tenantId`; adds `hasTransferNumber`.

## 9. Lead contract (SOURCE)
`POST /api/v1/leads` (`leads.write`), `PUT /api/v1/leads/:id`. Body field `klarosLeadId` (camelCase; snake_case rejected). Requires column `leads.klaros_lead_id` (migration 070).

## 10. Outbound call contract (SOURCE)
`POST /api/v1/calls/outbound` (`calls.write`): `toNumber` required; optional `reason`, `openingContext`, `fromNumber`, `phoneNumberId`, `klarosLeadId`. **No real call placed or authorised.**

## 11. Webhook registration contract (SOURCE)
`POST /api/v1/webhooks` (`webhooks.manage`), body `{name, url, events[], headers?}`. Requires a Professional+ plan. URL must be HTTPS, SSRF-validated (all resolved IPs, IP-pinned, no redirects).
Events: `call.started`, `call.completed`, `lead.created`, `lead.updated`, `lead.qualified`, `lead.escalated`, `appointment.confirmed`, `appointment.rescheduled`, `appointment.cancelled` (`appointment.requested` is accepted but never emitted).
Envelope: `{id, type, timestamp, tenant_id, data}`.

## 12. Webhook signature contract (SOURCE)
| Field | Value |
|---|---|
| Signature header | `X-HallaAI-Signature` |
| Format | `sha256=<lowercase hex>` |
| Algorithm | HMAC-SHA256 |
| Signed string | `<timestamp>.<raw request body>` (exact bytes sent) |
| Timestamp header | `X-HallaAI-Timestamp`, epoch **seconds**; reference verifier tolerance ±300 s |
| Digest encoding | hex |
| Secret | 64 hex chars, used as UTF-8 key text; returned **only** in the create response; stored in plaintext (HMAC needs it); never logged; list/update omit it |
| Ordering | `lead.qualified` (id `<eventId>:lead.qualified`) is delivered before `call.completed` per webhook |
| Retry | Redis Streams group `calliq-klaros-webhook`, up to 8 attempts (`KLAROS_WEBHOOK_MAX_RETRIES`), then DLQ `calliq:stream:dlq`; delivery is idempotent on `(webhook_id, event_id)` |

Webhook signing secret: **NOT AVAILABLE** (can only exist after a webhook is created on a deployed build).

## 13. Scope policy (SOURCE)
Default-deny; 18 routes allowed: `workforce.read|write`, `leads.read|write`, `calls.read|write`, `appointments.read`, `webhooks.manage`. Everything else (dashboard, team, billing, api-keys, …) is denied for API keys even with all scopes. Missing scope → 403 naming the scope; bad/revoked key → 401; wrong tenant header → 403.

## 14. Migration 070 / deployment state
**Migration 070: UNKNOWN in the deployed database (cannot be queried — no credentials) — and the code that needs it is not deployed.**
Evidence the deployed build predates the integration (DEPLOYED probes, no data created):
- `HEAD` contains **0** Klaros files and no `sk_calliq_` handling in `require-tenant.ts`.
- Live `GET /api/v1/integrations/klaros/health` and a nonexistent route `/api/v1/zz-nonexistent-probe`, both with a bogus `sk_calliq_` bearer, return the **identical** 401 `"Invalid or expired session — sign in again"` (the JWT path). Current source would return `"Invalid or revoked API key"`.
- Unauthenticated `GET` of the three Klaros routes returns generic 401 `Unauthorized`.
**MIGRATION 070 REQUIRED BEFORE KLAROS LIVE TEST** — apply `supabase/migrations/070_klaros_integration.sql` to the target database **before** deploying this code (the code writes `klaros_lead_id`, `qualification_*`, `webhook_deliveries.event_id`).

## 15. Real tests performed
| Test | Result |
|---|---|
| DNS / TLS / `/health` / `/ready` on production host | PASS (DEPLOYED) |
| Klaros route presence on production | FAIL — not present (DEPLOYED) |
| Unauthenticated + bogus-key probes (read-only) | Performed; confirm older build |
| Source audit of routes, auth, scopes, signing, SSRF, migration | PASS (SOURCE) |

## 16. Blocked tests (all NOT TESTED)
Authenticated health/workforce/agents; missing/invalid/revoked/expired/wrong-tenant key matrix against a live tenant; lead create/update with `klarosLeadId`; outbound call; webhook registration; signed delivery (signature, timestamp, event id, tenant id, raw-body, retry); qualification → `lead.qualified` → `call.completed` ordering; `lead.escalated`. Reason: no deployed Klaros build, no test tenant, no key, no confirmed Klaros staging URL. No data was created, no webhook registered, no call placed.

## 17. Exact next action (owner: Halla operator)
1. Review and commit the Klaros work (currently uncommitted; this session did not commit or push).
2. Deploy to **staging** first (`halla-ai-gateway-staging`, branch `staging`) against a **staging/test** Supabase database; apply migration 070 there first.
3. Create a dedicated test tenant (Professional+ plan for webhooks) and, from its dashboard, issue an API key with scopes `workforce.read workforce.write leads.read leads.write calls.read calls.write webhooks.manage`. Deliver the key to Klaros through a secret store, never chat/git.
4. Klaros supplies its **staging** webhook HTTPS URL; register it with `POST /api/v1/webhooks`; store the one-time signing secret in Klaros' secret store.
5. Re-run this handoff task to execute the live checks. Place a controlled call only with explicit authorisation.

## 18. Exact Klaros configuration required
```
HALLA_BASE_URL=<staging gateway URL once deployed>   # not production
HALLA_API_KEY=<from secret store>                    # header: Authorization: Bearer <key>
HALLA_WEBHOOK_SECRET=<from secret store>             # verify HMAC-SHA256 over "<X-HallaAI-Timestamp>.<raw body>", compare to X-HallaAI-Signature "sha256=<hex>", reject |now-ts|>300s, dedupe on event id
```

## 19. Security notes
- Secrets are never committed; the raw key and signing secret are shown once and exist only in secret stores.
- Webhook secret is stored in plaintext by design (HMAC); DB access should be restricted accordingly.
- Do not point webhooks at unconfirmed or production endpoints; the SSRF guard enforces HTTPS and blocks private ranges.
- Pre-existing, unrelated: `ivrService.createAgent/updateAgent` bind a JSON string to `TEXT[]` (recorded by an `it.fails` test); `call.completed.appointmentId` is never populated; a gateway crash mid post-call can drop that call's finalization event.

## Handoff block
```
HALLA LIVE KLAROS HANDOFF
Environment: production host only (no staging deployed/verified)
Base URL: https://gateway.hallaai.com (NOT Klaros-capable; do not use for the live test)
API Key Header: Authorization (Bearer, prefix sk_calliq_)
Halla Tenant ID: NOT AVAILABLE
API Key: NOT AVAILABLE
Webhook Signing Secret: NOT AVAILABLE
Webhook Endpoint: NOT AVAILABLE (no confirmed Klaros staging URL)
Webhook Signature Header: X-HallaAI-Signature
Webhook Algorithm: HMAC-SHA256 over "<timestamp>.<raw body>"
Webhook Timestamp Format: epoch seconds, header X-HallaAI-Timestamp
Webhook Digest Encoding: hex, "sha256=" prefix
Migration 070: UNKNOWN (REQUIRED BEFORE KLAROS LIVE TEST)
Health: PASS (platform /health, /ready only)
Authenticated Health: BLOCKED
Workforce: BLOCKED
Agents: BLOCKED
Lead Create: BLOCKED
Lead Update: BLOCKED
Webhook Registration: BLOCKED
Signed Webhook: BLOCKED
```
