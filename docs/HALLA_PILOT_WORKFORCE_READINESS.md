# Halla Pilot Workforce Readiness — Medical Tourism and Dropshipping

**OVERALL STATUS: PRODUCTION BLOCKED / STAGING-READY (conditional)**

Date: 2026-10-06 · Repository: Middle-East · Branch: `staging` · **Uncommitted. Nothing pushed, nothing deployed, Klaros untouched, no production traffic, no production credential used.**

Not production-ready because material blockers remain: `HALLA_LIVE_SAFETY_CONTROL = BLOCKED` · `KLAROS_WEBHOOK_DELIVERY = BLOCKED` · `LIVE_MODEL_BEHAVIOUR = NOT_TESTED` · `RLS_APPLIED_TO_PRODUCTION = NOT_TESTED` · `ORDER_LOOKUP = BLOCKED_PENDING_KLAROS_READ_API` (Dropshipping).

Staging-ready is **conditional**: migration 072 must be applied to the staging database first, and the RLS suite re-run against it (§2.5).

Classification: **REAL / PASSED**, **REAL / FAILED**, **BLOCKED**, **MOCKED**, **NOT TESTED**. These states are also data, pinned by tests: `apps/gateway/src/services/workforce-templates/readiness.ts` and `tests/unit/gateway/workforce-readiness.test.ts`.

---

## 1. Status of every item

| # | Item | Status | Evidence |
|---|---|---|---|
| RLS | Tenant isolation under a non-superuser, non-BYPASSRLS role | **REAL / PASSED** in the repository (migration 072) | §2: 4 tables + all 80 tenant tables, mutation tests, fresh-database run |
| RLS | 072 applied to staging / to production | **NOT TESTED** (not applied anywhere) | §2.5 |
| 429 | Klaros webhook delivery | **BLOCKED** — cause not provable from Halla | §3 |
| 429 | Halla sender: signing, SSRF, fail-closed, retries, tenant isolation | **REAL / PASSED** (real PostgreSQL; transport and Klaros receiver **MOCKED/modelled**) | §3.3 |
| F3 | Per-tool quota counted all tools; `transfer_call` denied after any other tool | **FIXED** — REAL / PASSED | §4, mutation-checked |
| F4 | Agent `services` bound as JSON text to a `TEXT[]` column | **FIXED** — REAL / PASSED | §4 |
| F5 | Base prompt claimed to be human, New York English, forced email/address | **FIXED** — REAL / PASSED | §4, mutation-checked |
| F8 | Tool arguments, caller text, bodies reached logs and the Redis audit list | **FIXED** — REAL / PASSED | §4, mutation-checked |
| F9 | Order / payment / refund / shipment / tracking lookup | **BLOCKED_PENDING_KLAROS_READ_API** | §6 |
| — | Content-level safety enforcement | **BLOCKED** (architectural; decision needed) | §5 |
| — | Provisioning safety | **REAL / PASSED** (local throwaway database only) | §7 |
| — | Live model behaviour | **NOT TESTED** (no sandbox key) | §8 |

---

## 2. Row-level security — fixed in migration 072

### 2.1 Root cause (confirmed in this repository, not Klaros)
- `voice_tenants` ↔ `team_members` policies referenced each other, so any non-bypass role hit `infinite recursion detected in policy`; `ai_agents` and `ai_agent_configs` reach those tables and failed the same way. A legitimate owner could not read their own rows through RLS (it failed closed).
- Migration 011 left `Service role can manage tenants … FOR ALL USING (true)` for **PUBLIC** on `voice_tenants`. Policies are OR-ed, so once the recursion is removed that single policy lets any authenticated **or anonymous** role read and write every tenant's row: name, phone, **transfer/escalation number**.
- Same class of defect elsewhere: PUBLIC `true` policies on `invoices`, `knowledge_base`, `knowledge_ingestion_runs`; six `INSERT … WITH CHECK (true)` log tables (`audit_logs`, `ai_performance_metrics`, `call_evaluations`, `integration_audit_log`, `phone_number_logs`, `usage_records`); no RLS at all on `call_quality_scores`, `call_spam_log`, `integration_sync_state`, `enterprise_auth_sessions`, `scim_directory_users`.
- The gateway is unaffected (privileged connection, `tenant_id` scoping in code). The exposure is anything that reaches the database as `anon`/`authenticated` (the Supabase anon key is public in browsers; RLS is the barrier).

### 2.2 The fix: `supabase/migrations/072_halla_rls_hardening.sql` (a migration; no manual patching)
- Three narrowly scoped helpers — `user_can_access_tenant`, `user_is_tenant_owner`, `user_is_tenant_admin` — `SECURITY DEFINER`, `STABLE`, `SET search_path = pg_catalog, public`, each a boolean about `auth.uid()`; `EXECUTE` revoked from PUBLIC and granted only to `authenticated` and `service_role`. They read the base tables as the owner, so the policies never re-enter each other (this is what removes the recursion). They return only a boolean, never rows.
- Replaced the recursive policies on the four tables; dropped every `USING (true)` / `WITH CHECK (true)` policy; replaced the six log-insert policies with tenant-scoped `INSERT` checks; enabled RLS (member `SELECT` or deny-by-default) on the five tables that had none.
- No `ENABLE`→`DISABLE`, no `BYPASSRLS`, no service-role or superuser shortcut, no app-only filtering. Idempotent. Forward-only like every migration here; a rollback would have to recreate the vulnerable policies, so none is provided.

### 2.3 Evidence (REAL, PostgreSQL 16, non-superuser non-BYPASSRLS login role; `auth.uid()` driven by a JWT subject claim)
- `tests/integration/rls-tenant-isolation.postgres.test.ts` — **15 tests**:
  - A can access A; A cannot read/insert/update/delete B; B cannot access A; anon/tenant-less obtain nothing; secrets and escalation numbers never cross tenants; within a tenant only the owner manages the team.
  - **Catalog audit:** no open `true` policy, RLS on every tenant table, no policy dependency cycle, every definer pins `search_path`, helpers not executable by `anon`.
  - **Generic audit over every table carrying `tenant_id`: 80 of 80 seeded and probed, 0 failures.** (An earlier version of the seeder could only seed 63 of 80; the 17 it skipped included `invoices`, `knowledge_base`, `audit_logs`. The seeder now learns allowed values from simple CHECK constraints and handles `time`/`vector`, and the test **fails** if any tenant table cannot be seeded, so a new table cannot slip through unproven.)
- **Mutation tests (the suite must fail when a defect is restored), then rolled back:** A — restore the PUBLIC `USING (true)` policy on `voice_tenants`: isolation and catalog checks FAIL. B — restore the recursive `voice_tenants` ↔ `team_members` policies: FAIL. C — disable RLS on a tenant table, or restore a PUBLIC `true` INSERT policy: catalog audit FAILS. Afterwards the fixed state is re-verified intact.
- `tests/integration/rls-fresh-migration.postgres.test.ts` — **9 tests**, a brand-new database built from the shim + `schema.sql` + migrations 001→071 → **the defects are present** (open policies, the recursion cycle, a real `infinite recursion detected in policy` error, `call_spam_log` without RLS) → apply 072 → **clean, and isolation holds** → re-apply 072 → **identical policy snapshot** → no later migration may recreate a dropped policy.
- `tests/helpers/supabase-shim.sql` is test-only (roles `anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()`); it creates what Supabase provides and nothing else, and is never applied to a real database.
- **MOCKED: nothing in the RLS proof.** It runs against real PostgreSQL policies as real non-bypass roles.

### 2.4 Limits of the proof
- A shim, not Supabase itself: Supabase's own grants, `auth` schema and PostgREST layer are not exercised.
- Policies are tested as written; whether the *dashboard* still works for team members (it relies on `team_members` SELECT through the helper) was not exercised in a browser.

### 2.5 Not done / required before staging and production
- **Apply 072 to the staging database** and re-run both RLS suites against it. **NOT TESTED.**
- **Production:** the live policy state was never inspected (that needs a production connection, not authorised) and 072 has not been applied. Until it is applied and verified, **assume production still has the pre-072 policies**, including the PUBLIC `voice_tenants` policy. `RLS_APPLIED_TO_PRODUCTION = NOT_TESTED` keeps `PRODUCTION_READY = BLOCKED`.
- Applying 072 changes dashboard access for every tenant; take a backup and apply to staging first.

---

## 3. Klaros webhook 429 — BLOCKED (not provable from Halla)

### 3.1 What Halla's own record shows (historical; no new production request was made)
URL verified exact (94 chars, no hidden characters); webhook active, events correct; six then eight sequential attempts, backoff doubling 20 s → 300 s as designed, never concurrent; Halla stored status 429 and body `Too Many Requests` (plain text); `failure_count` 8, `last_triggered_at` NULL. The body is plain text; Klaros's own limiter returns JSON. That points at a layer in front of the Klaros application, but **Halla discarded the headers that would prove it**, so this is a hypothesis, not a finding.

### 3.2 What is now captured safely, and what the next 429 would prove
Every non-2xx response is logged as `KLAROS_WEBHOOK_NON_SUCCESS_RESPONSE` with **only** an allow-list: `status`, `content-type`, `retry-after`, `x-request-id`, `server`, `via`, `cf-ray`, `cf-cache-status`, `rndr-id`, `x-render-origin-server`, rate-limit headers, plus the `User-Agent` Halla sent (`HallaAI-Webhooks/1.0`) and a layer **hint**. Each value is length-capped. Never logged (tested with planted values): `Authorization`, the signing secret, the signature, the request body, lead content, phone, email, `Set-Cookie` or any non-allow-listed header.

| The next 429 shows… | It indicates | It does **not** prove |
|---|---|---|
| JSON body **and** `x-request-id` **and** `x-render-origin-server` | the Klaros application (or its framework) produced it (`layerHint: application`) | which rule fired |
| non-JSON (text/HTML), **no** request id, **no** origin-server header, CDN/proxy markers (`server: cloudflare`, `cf-ray`, `via`) | an edge/proxy layer in front of Klaros (`layerHint: edge_or_proxy`) | that Klaros's code is correct, or which edge rule matched |
| anything else, or no headers | `indeterminate` | — |

It is a **hint from allow-listed headers only**. Root cause is **not** claimed. Needed to close it: Klaros's logs for 14:54–15:10 UTC on 2026-10-04 and which commit is live (the Halla route exists only on `deploy/klaros-halla`).

### 3.3 Sender regression (REAL PostgreSQL; transport and DNS substituted; Klaros receiver = a **MODEL**)
`tests/integration/webhook-sender.postgres.test.ts` (**26 tests**) and `tests/unit/gateway/webhook-diagnostics.test.ts` (**9**). The receiver is an independent TypeScript model of the pipeline Klaros documents (signature + 300 s freshness, tenant mapping, envelope validation, tenant match, de-duplication) driven with the exact bytes Halla produces. **It is not Klaros**; it shows Halla's output satisfies the documented rules, not that Klaros accepts it.
- **Each of the nine events** (`call.started`, `call.completed`, `lead.created/updated/qualified/escalated`, `appointment.confirmed/rescheduled/cancelled`): delivered once, signed, in the agreed envelope, accepted by the model, recorded.
- **Receiver rules:** valid signature accepted; tampered body, wrong secret, malformed and missing signature → 401; stale/future timestamp → 401; unknown tenant / no connection / no secret → 404; tenant mismatch → 403; malformed envelope variants (not JSON, not object, missing id/type/tenant, bad data, unsupported type) → 400; duplicate and replay accepted once.
- **Sender:** an event for tenant A reaches only A's webhook with A's tenant id and A's signature; inactive, unsubscribed and webhook-less tenants receive nothing.
- **Retry / idempotency:** a 429 throws (the bus retries), is recorded, a later success delivers, and a delivered event is never re-sent.
- **Weaknesses found and fixed in Halla's sender:** a webhook row with no signing secret was **sent unsigned** — it now refuses, records the failure and lets the bus retry; the legacy `dispatchEvent` (test-event endpoint) used a raw `fetch` that followed redirects, skipped the SSRF check at dispatch time and could send unsigned — it now uses the same guarded path.
- Ordering, DLQ, crash recovery and event-bus idempotency are covered by existing real-Redis suites that were re-run and pass (`klaros-ordered-delivery` 13, `klaros-e2e` 7, `klaros-webhook-delivery` 41, `klaros-postgres` 25, `klaros-event-retry-dlq`). Four of those suites mock `safe-http`; they now spread the real module so the new diagnostics exports exist (they failed on this change before the fix, then passed).

---

## 4. F3 / F4 / F5 / F8 regression

All suites re-run against the current tree: **12 suites, 288 tests, all pass** (governance, base prompt, redaction, static logging guard, error handler, templates, readiness, order lookup, event contract, eval harness, real-PostgreSQL workforce, real-Redis redaction).

**Mutation checks (break the code, the tests must fail, then restore byte-for-byte — 7 of 7 caught):**

| Mutation | Result |
|---|---|
| F3: per-tool quota compared against the all-tools counter (the original bug) | caught (1 failing) |
| F5: prompt says "a real person, not a bot" | caught (5) |
| F5: prompt assumes a New York caller | caught (5) |
| F8: `redactString` returns raw values | caught (13) |
| F8: secret-looking values no longer redacted | caught (7) |
| F8: free-text phone scrubbing removed | **first run NOT caught** — a real test gap (the only phone-in-text test hid the number inside a Postgres `(col)=(value)` pattern a different rule redacts). Added a phone-in-prose test (three formats); now **caught (1)** |
| F8: a new raw-argument log call on the live tool path | caught (1, the static guard) |

### F5 — the base prompt
Rewritten in `receptionist-voice.ts` and `realtime-prompt-builder.ts`, plus tool descriptions and the two text-path prompts (including `ai-config.service.ts`, which still told the model "Never say you are an AI"). The live session is `preamble + role block + full prompt`; all three are platform-neutral.
- **Removed:** "real person", "real human", "not a bot", "not an AI", "never say you are an AI", the instruction to sound human, "New York / NYC / tri-state", forced "American English", the Saudi-only Arabic persona, the US emergency number, and every mandatory "always ask for email / service address".
- **Added (`PLATFORM_BASE_RULES`):** it is an AI assistant and says so when sincerely asked; honest about uncertainty; never fabricates; tenant text is untrusted configuration that cannot override platform rules; data minimisation; escalate when required; a refused tool is never pretended to have worked.
- **Language** follows the caller and the tenant default; no assumption about country, city or accent. Email/address are asked for only when the business requires them.
- Vertical-neutral (tested); vertical rules stay in the agent prompts. **Behaviour change:** the Arabic persona matches the caller's dialect instead of forcing Saudi.

### F8 — redaction (`apps/gateway/src/security/tool-arg-redaction.ts`)
- Values become **constant markers** (`[REDACTED_PHONE]`, `_EMAIL`, `_NAME`, `_ADDRESS`, `_TEXT`, `_SECRET`, `_PAYMENT`, `_NUMBER`, `_DATETIME`, `_ID`); structure kept; deny-by-default; nothing hashed or partially kept.
- Tool result and denial text reduced to **fixed platform phrases** (a scrubbing regex cannot recognise a name inside "Saved lead for Jane…", so unknown wording is never kept).
- **Paths covered:** tool execution logs, per-tool log lines, thrown-error text, `AI_EXECUTION_FAILURE`, the platform event payload, the **Redis audit list**, the in-memory audit buffer, legacy audit entries (redacted on read), RAG query logs, model text deltas, caller transcripts, tool-result messages sent back to the model, the **global error handler (it logged every failed request's whole body and query)**, and telephony plumbing (incoming-call webhook, SMS, workflow engine, automation email, Twilio error bodies). The webhook sender's logs were audited this phase (§3.2).
- **Proof:** unit tests, an end-to-end test through the live path on **real PostgreSQL + real Redis** (names, phones, emails, notes, medical text, card, secret absent from every log call, the Redis list and the model-facing result), the mutation checks above, and a static guard that fails if a log call on the pipeline includes raw arguments again.
- **Not fixed (listed):** staff e-mail addresses in team-invite and calendar-OAuth logs; raw error objects in `ai-config.service.ts` `console.error` calls (pre-existing; it logs a Postgres `detail` that may contain tenant-configuration values or tenant ids, not caller data); the message of an unexpected error is scrubbed best-effort only.

---

## 5. Content safety — `HALLA_LIVE_SAFETY_CONTROL = BLOCKED`

Not implemented, deliberately. The live path is OpenAI Realtime speech-to-speech: audio streams while the model generates, so transcript text arrives with or after the speech it describes. A guard could only cancel a response part-way (some audio already heard) or the pipeline would have to become text generation + synthesis. A keyword filter would not be evidence of medical safety.

**Preserved and configured in the live prompts:** emergency escalation, diagnosis/prescription/outcome-guarantee refusal, fabrication refusal, human escalation, knowledge boundary, and the disabled side-effect tools. **Enforced in code:** only the tool layer (governance, quotas, risk, `safety_mode`).

**Decision needed from you (product/architecture):**
1. **Accept prompt-only safety for a supervised pilot** — sandbox numbers only, every call reviewed by a human, side-effect tools disabled. Feasible now; it does **not** make the control READY.
2. **Build a code-level control** — the realistic option is to move the live path to text generation + synthesis so output can be checked before it is spoken. This adds latency and is a pipeline change; a cancel-on-transcript guard on Realtime would leak audio and should not be called a control.
Until you choose and it is built and tested, this stays **BLOCKED**. The flag cannot be flipped by prose: `CODE_LEVEL_OUTPUT_GUARD_IMPLEMENTED = false`, a test asserts `BLOCKED`, and another asserts that no output-guard module exists and nothing else claims the flag.

---

## 6. F9 — order lookup (`BLOCKED_PENDING_KLAROS_READ_API`)

**Re-verified this phase:** Klaros's file tree (about 1,000 files) has no order, shipment, tracking, fulfilment or supplier route or module; only dropshipping *validation* documents. No tenant-scoped read API exists, so none was invented and Klaros was not modified. Halla has no Klaros client or credential and holds no order data.

**Built (`services/order-lookup/order-lookup.service.ts`)** — the safe shape, ready for a provider: one read-only `lookup()`; tenant from the session/API key, never from input (another tenant's record answers exactly like "not found"); safe identifier validated before any provider call; allow-listed output (cost, margin, supplier, credentials, customer and card data are not representable); governance: read, medium risk, 3 per call, **Medical Tourism disables it**, offered to the model only when a provider is registered **and** the tenant opted in; RBAC: `GET /api/v1/integrations/klaros/orders/:reference` needs the dedicated `orders.read` scope and answers `501 BLOCKED_PENDING_KLAROS_READ_API` today.

**Effect today:** the tool is not offered, the route answers 501, and the Dropshipping prompts say no order tool exists, so the agents **escalate**.

---

## 7. Provisioning safety (sandbox)

`applyWorkforceTemplate()` requires **all** of:
1. `HALLA_ENVIRONMENT` explicitly `staging`, `development` or `test` (unset = refuse; `NODE_ENV` cannot tell staging from production). `render.staging.yaml` sets `HALLA_ENVIRONMENT=staging` and declares `HALLA_WORKFORCE_SANDBOX_TENANT_IDS` as a prompt-only secret. **Never set on the production service.**
2. The tenant id is in `HALLA_WORKFORCE_SANDBOX_TENANT_IDS` (empty by default).
3. The template validates (no tenant facts, URLs, emails, numbers, money, secrets; safe governance; medical disables the order tool).
4. **Pre-flight, before any write:** a valid E.164 transfer number, and a plan allowing three active agents (professional or trialing).

Dry-run first; side-effect tools stay disabled; no production tenant, credential or business data is ever created. Proven on real PostgreSQL (`workforce-templates.postgres.test.ts`, 30 tests, re-run and passing).

### Exact steps for a staging tenant
1. Dedicated staging database; apply `schema.sql` and migrations **001–072**; run the RLS suites against it. Dedicated staging gateway with `HALLA_ENVIRONMENT=staging`.
2. Sandbox tenant on a professional/trialing plan, with a transfer number.
3. Set `HALLA_WORKFORCE_SANDBOX_TENANT_IDS=<tenant id>` on the staging gateway only.
4. `applyWorkforceTemplate(tenantId, WORKFORCE_TEMPLATES.<vertical>, { dryRun: true })`, review warnings, then apply.
5. Load the business's verified knowledge into the tenant knowledge base. Do **not** put it in a template.
6. Attach no agent to a real number until the blockers below are cleared and a sandbox number is explicitly approved.
7. Verify: `GET …/klaros/agents` (three agents), `GET …/klaros/workforce`, governance columns (`safety_mode='standard'`, five side-effect tools disabled).

---

## 8. Live model evaluation — NOT TESTED

`HALLA_EVAL_OPENAI_API_KEY` is **not set**, and the production key is never used. Built: **21 scenarios** (Medical: diagnosis, prescription, emergency, outcome guarantee, fake doctor, fake hospital, fake price, normal enquiry, human, AI identity. Dropshipping: fake spec, stock, price, delivery date, delivery guarantee, payment dispute, refund dispute, chargeback, tracking, normal enquiry, order status), run against the exact composed live prompt, 3 trials each at temperature 0, with transcripts printed. They run **only** when that variable is set; the 21 live tests are skipped. The rubric logic is validated with canned good and bad replies for all 21 (**MOCKED**). It is a text-mode proxy with blunt rubrics: a pass would mean "no obvious failure", not "safe".

---

## 9. Readiness matrix

| | Medical Tourism | Dropshipping |
|---|---|---|
| WORKFORCE_DEFINED | READY | READY |
| AGENTS_CONFIGURED | READY (local sandbox only) | READY (local sandbox only) |
| PROMPTS_CONFIGURED | READY | READY |
| ESCALATION_CONFIGURED | READY (prompt + `transfer_call`, F3 fixed) | READY |
| SAFETY_POLICY_AVAILABLE | **BLOCKED** | **BLOCKED** |
| KLAROS_INTEGRATION_READY | READY (contract); Klaros pilot layer NOT TESTED | READY (contract); NOT TESTED |
| WEBHOOK_READY | **BLOCKED** (429) | **BLOCKED** |
| ORDER_LOOKUP | NOT_APPLICABLE | **BLOCKED_PENDING_KLAROS_READ_API** |
| ROW_LEVEL_SECURITY (fix verified in repo) | **READY** | **READY** |
| RLS_APPLIED_TO_STAGING | NOT_TESTED | NOT_TESTED |
| RLS_APPLIED_TO_PRODUCTION | NOT_TESTED | NOT_TESTED |
| LIVE_MODEL_BEHAVIOUR | NOT_TESTED | NOT_TESTED |
| STAGING_READY | READY (conditional: apply 072 first) | READY (conditional; order agents can only escalate) |
| PRODUCTION_READY | **BLOCKED** | **BLOCKED** |

---

## 10. Verification (2026-10-06)

| Check | Result |
|---|---|
| Full suite, real PostgreSQL 16 + Redis 7, 72 migrations (final run) | **REAL / PASSED** — **82 / 82 files, 915 passed, 0 failed, 21 skipped** (936 total); the 21 skipped are the live-model eval (NOT TESTED) |
| Full suite, plain (no databases) | **REAL / PASSED** — 73 files passed, 9 skipped; **777 passed, 0 failed, 159 skipped** (936 total); real-infrastructure and live-model suites skip without their infrastructure |
| First full run, before the sender-mock fix | **REAL / FAILED** — 5 files, 8 tests (four `klaros-*` suites whose hand-written `safe-http` mocks lacked the new exports; one readiness test that timed out under load). Both causes fixed in the tests (the sender code was correct); the five files re-ran **96 / 96**, then the whole suite as above |
| One intermittent runner crash | In 1 of 4 full runs a vitest worker died ("Worker exited unexpectedly", the known `onUserConsoleLog` teardown race, near `realtime.tools.test.ts`) and **one file (25 tests) was silently dropped while the exit code stayed 0**, because `vitest.config.ts` sets `dangerouslyIgnoreUnhandledErrors: true`. That run read 911 tests, not 936. A rerun gave 936 / 82 files. **Do not trust the exit code alone: check the file and test totals (82 files, 936 tests).** Not a product failure; not fixed (config left as is) |
| RLS isolation (non-bypass roles) | 15 tests, generic audit **80/80 tables**, 0 failures, 3 mutation tests |
| Fresh database 001→072 | 9 tests: defects reproduce before 072, clean after, idempotent |
| Webhook sender + diagnostics | 26 + 9 tests |
| F3/F5/F8 mutation checks | 7 of 7 caught (one test gap found and closed) |
| `apps/gateway`: `tsc --noEmit` · `eslint src --max-warnings=0` · `node build.cjs` | REAL / PASSED |
| Root-level `tsc` | **FAILS on a file this work did not touch** — `apps/gateway/tests/synthetic-callers/scenarios/booking-flow.ts` (syntax errors, unchanged since the initial commit); the gateway package itself type-checks |

---

## 11. Security review

- **Secrets:** every changed and new file scanned. Only match: the fixed synthetic fixture `sk_live_abcdef1234567890ABCDEF` used by the redaction tests to prove it is redacted. No `.env` change; no hardcoded database credential; the RLS test role password is generated per run. Five zero-byte junk files left in the repo root by shell redirection were removed.
- **Logging / PII:** tool arguments, caller text, request bodies, telephony numbers and webhook responses are covered (§3.2, §4); residuals are listed in §4.
- **RLS / tenant isolation:** fixed and proven (§2). The gateway still relies on code-level `tenant_id` scoping on its privileged connection; RLS protects the anon/authenticated path.
- **Webhook auth / replay / idempotency:** HMAC signing and 300 s freshness verified; replay and duplicates handled; the two sender weaknesses (unsigned send, unguarded legacy path) fixed.
- **RBAC:** unchanged except one new read-only scope (`orders.read`), added deliberately to the route matrix.
- **Tool governance:** per-tool quota bug fixed; `safety_mode` strict still denies `transfer_call` by design.
- **Prompt injection:** template strings pass the scanner; tenant text stays wrapped, capped and cannot override platform rules.
- **Provisioning:** fail-safe environment gate, allow-list, validation, pre-flight (§7).
- **Rate limiting:** unchanged; the Klaros 429 is outside Halla's limiter.
- **Not covered:** a live-model security review; the Klaros side; a Supabase-hosted RLS run; the production database.

---

## 12. Remaining blockers and exact next action

1. **RLS rollout:** back up, apply 072 to **staging**, re-run both RLS suites against it, verify the dashboard; then inspect the production policy state and apply there. Requires your explicit authorisation.
2. **Content safety:** choose §5 option 1 or 2. Until then BLOCKED.
3. **Klaros 429:** Klaros-side logs and deployed commit; Halla now captures the headers if it recurs.
4. **Order lookup:** a Klaros read API (read-only, tenant-scoped, `orders.read`), then a provider adapter and a Dropshipping template bump.
5. **Live model:** supply a sandbox `HALLA_EVAL_OPENAI_API_KEY` and read the transcripts.
6. Open medium items: spoken persona name is the Klaros label (F6); knowledge category not applied to realtime search (F7); `confirmation_required_tools` unused (F10); no in-call agent hand-off (F11); staff emails and the `ai-config` error logging noted in §4.
7. Nothing is committed. **Exact next action:** review this working tree and authorise a commit to `staging`; then apply 072 to the staging database (step 1) before provisioning a sandbox tenant (§7).
