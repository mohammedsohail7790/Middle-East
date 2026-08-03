# Call IQ Security Audit — May 2026

Phases 1–3: discovery, remediation, and follow-up actions.

---

## 1. FIXED

### [A] Secrets & credentials

| File | Fix |
|------|-----|
| `test-keys-simple.js` | Removed hardcoded OpenAI/Twilio/ElevenLabs/Deepgram keys; reads `process.env` only |
| `create-tenant.js` | Removed hardcoded Supabase password; requires `DATABASE_URL` / `GATEWAY_DATABASE_URL` |
| `check-tenants.js` | Removed hardcoded DB password; requires env connection string |
| `check-tenant.js` | Removed hardcoded Supabase service role key; requires env vars |
| `.gitignore` | Explicit ignore for `apps/gateway/.env`, `apps/dashboard/.env.local`, `credentials.json` |
| `.env.example` | Added rate-limit, JWT TTL, CORS, `INTERNAL_API_KEY`, `SSE_TOKEN_TTL_SEC` placeholders |
| `apps/gateway/.env.example` | Tiered rate limits, JWT TTL, `TWILIO_SKIP_SIGNATURE_VALIDATION`, `INTERNAL_API_KEY` |

### [B] Rate limiting

| File | Fix |
|------|-----|
| `apps/gateway/src/security/tiered-rate-limit.ts` | **New** — sliding window: public 20/min/IP, auth 5/min/IP, user 60/min/tenant, LLM 10/min/tenant; Redis with memory fallback; `429` + `Retry-After` |
| `apps/gateway/src/index.ts` | Replaced coarse `/api/` limit with `tieredRateLimitMiddleware` on all `/api/*` routes |

### [C] Input validation

| File | Fix |
|------|-----|
| `apps/gateway/src/security/validate.ts` | **New** — `requireString`, `requireUuid`, `pickAllowedKeys`, `ValidationError`, `stripHtml` |
| `apps/gateway/src/security/ssrf-guard.ts` | **New** — blocks private/metadata hosts for knowledge URL fetch |
| `apps/gateway/src/services/knowledge/knowledge-ingestion.service.ts` | `ingestWebsite` uses `assertSafePublicUrl` before `fetch` |
| `apps/gateway/src/services/ai-config/ai-config.controller.ts` | Injection scan + length cap on `systemInstructions` / do/don't / greeting on PUT |

### [D] Auth & sessions

| File | Fix |
|------|-----|
| `apps/gateway/src/middleware/api-auth-unless-public.ts` | **New** — `requireVoiceApiAccess` on all `/api/v1` routes except Twilio webhooks, OAuth callbacks, billing plans |
| `apps/gateway/src/index.ts` | Mounts `apiAuthUnlessPublic` on `apiRouter` (enterprise routers no longer trust `x-tenant-id` alone) |
| `apps/gateway/src/services/auth/resolve-tenant.ts` | Query `token` only accepted as short-lived SSE token; full JWT must use `Authorization` header |
| `apps/gateway/src/security/sse-token.ts` | **New** — 5-minute SSE tokens (`calliq-sse` claim) |
| `apps/gateway/src/services/dashboard/dashboard.controller.ts` | `GET /dashboard/sse-token`, `GET /dashboard/csrf-token` |
| `apps/dashboard/src/lib/realtime.ts` | SSE uses `/dashboard/sse-token` instead of Supabase access token in URL |
| `apps/gateway/src/middleware/csrf.ts` | **New** — Redis-backed CSRF for Bearer-authenticated mutations |
| `apps/dashboard/src/lib/api.ts` | Fetches and sends `X-CSRF-Token` on POST/PUT/PATCH/DELETE |
| `apps/gateway/src/services/auth/jwt-tenant-verifier.ts` | Gateway JWT verify uses `maxAge: JWT_ACCESS_TTL` (default 15m) |
| `apps/gateway/src/security/gateway-jwt.ts` | **New** — access/refresh sign helpers + Redis refresh revocation |
| `apps/gateway/src/services/voice/security.ts` | Twilio HMAC no longer bypassed in dev unless `TWILIO_SKIP_SIGNATURE_VALIDATION=true` (non-prod only); removed body logging |

### [E] Prompt injection

| File | Fix |
|------|-----|
| `apps/gateway/src/security/prompt-safety.ts` | **New** — delimiters, injection pattern scan, length caps |
| `apps/gateway/src/services/realtime/realtime.gateway.ts` | Tenant AI instructions wrapped with `wrapUntrustedBlock` |
| `apps/gateway/src/services/ai-config/ai-config.controller.ts` | Rejects known injection patterns on config save |
| `apps/gateway/src/services/voice/ai.service.ts` | Caller transcript + knowledge wrapped; injection scan on turns; `max_tokens` capped |

### [F] CORS & security headers

| File | Fix |
|------|-----|
| `apps/gateway/src/middleware/security-headers.ts` | **New** — CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS (prod) |
| `apps/gateway/src/index.ts` | HTTPS redirect (prod), explicit CORS allowlist (no `*` in prod), localhost only in non-prod |
| `apps/gateway/src/services/env.ts` | Rejects `ALLOWED_ORIGINS=*` in production; requires CORS origins + internal API key in prod |
| `apps/dashboard/next.config.js` | CSP, Referrer-Policy, Permissions-Policy, X-Frame-Options DENY |

### [G] Error handling & logging

| File | Fix |
|------|-----|
| `apps/gateway/src/middleware/error-handler.ts` | Redacts password/token fields in logs; generic 500 to clients; no stack in prod |
| `apps/gateway/src/security/safe-error.ts` | **New** — `sendSafeError`, `clientErrorMessage` helpers |
| `apps/gateway/src/services/dashboard/dashboard.controller.ts` | Generic client errors via `safeClientError` |
| `apps/gateway/src/services/ai-config/ai-config.controller.ts` | TTS errors no longer return upstream body |
| `apps/gateway/src/index.ts` | `/internal/ai-governance` requires `INTERNAL_API_KEY` or `VOICE_INTERNAL_API_KEY` (no open fallback) |

---

## 2. MANUAL ACTION REQUIRED

1. **Rotate all leaked credentials** — Keys/passwords appeared in git-tracked or local files:
   - `test-keys-simple.js` (historical), `create-tenant.js`, `check-tenants.js`
   - `apps/gateway/.env`, `apps/dashboard/.env.local` (if ever committed)
   - Rotate: OpenAI, Twilio, ElevenLabs, Deepgram, Supabase DB password, JWT secrets, Stripe, internal API keys.

2. **Production environment** — Set on Render/Vercel:
   - `ALLOWED_ORIGINS`, `DASHBOARD_URL`
   - `INTERNAL_API_KEY` or `VOICE_INTERNAL_API_KEY`
   - `JWT_SECRET`, tiered `RATE_LIMIT_*` vars
   - Never set `TWILIO_SKIP_SIGNATURE_VALIDATION=true` in production
   - Never set `ALLOWED_ORIGINS=*`

3. **Redis** — Multi-instance deployments need shared Redis for rate limits, CSRF, SSE nonce, and refresh revocation (already uses `voiceRedis` when available).

4. **Supabase session policy** — Dashboard uses Supabase access tokens; configure Supabase Auth JWT expiry (~15m) and refresh (~7d) in the Supabase dashboard to match policy.

5. **Git history** — If secrets were committed, use `git filter-repo` or BFG and force-push after rotation (coordinate with team).

6. **Remove local `.env` from any backup** — Ensure `apps/gateway/.env` and `apps/dashboard/.env.local` are not in cloud sync public folders.

---

## 3. STILL AT RISK

| Item | Why |
|------|-----|
| **Per-route Zod on every controller** | Shared `validate.ts` + targeted checks added; full Zod schema on all 30+ routers not completed in this pass — add incrementally per route. |
| **`String(error)` in many controllers** | `voice.controller.ts`, billing, integrations, etc. still return `String(error)` in some handlers — migrate to `safeClientError` / `sendSafeError`. |
| **Cookie flags (HttpOnly, Secure, SameSite=Strict)** | Supabase SSR cookies managed by `@supabase/ssr`; gateway does not set session cookies. Configure in Supabase/Next cookie options if stricter policy required. |
| **Re-auth for password change / deletion / payment** | Not implemented — requires Supabase `reauthenticate` or step-up flow in dashboard. |
| **Gateway-issued refresh logout** | `gateway-jwt.ts` revocation helpers exist but no `/auth/logout` route wired yet; Supabase sign-out clears client only. |
| **CSRF on first mutation** | If Redis is down, CSRF validation may fail until token is issued — ensure Redis HA in production. |
| **Local dev Twilio webhooks** | Set `TWILIO_SKIP_SIGNATURE_VALIDATION=true` only locally when ngrok breaks HMAC; document in README. |
| **Committed `.env` in history** | Automated scan did not rewrite git history. |

---

## Deploy checklist

- [ ] Rotate leaked keys
- [ ] Set production env vars from `.env.example`
- [ ] Confirm Redis reachable from gateway
- [ ] Smoke-test: login → dashboard SSE → AI config save → Twilio webhook (staging)
- [ ] Verify CORS from `https://www.calliqlabs.com` only

---

## 4. HIPAA COMPLIANCE HARDENING — June 2026

### [H] HIPAA-specific fixes

| Item | Fix |
|------|-----|
| `apps/gateway/src/services/db/pool.ts` | `ssl: { rejectUnauthorized: false }` → `buildSslConfig()`: `rejectUnauthorized: true` in prod/staging; `PG_SSL_CA` env var for custom CA bundle; insecure mode only when `ALLOW_INSECURE_TLS=true` in non-prod |
| `apps/gateway/src/services/recordings/recording.service.ts` | `storeTranscript` now runs `redactTranscriptPii()` (SSN, CC, phone, email patterns) before DB insert; `storeRecording` uses `getSignedRecordingUrl()` for all tenants; HIPAA tenants store `storage://` path instead of a URL; `getRecording` and `getRecentCallsWithTranscripts` resolve signed URLs on the fly; `deleteRecording` handles both URL formats |
| `apps/gateway/src/services/sso/sso.service.ts` | `client_secret` encrypted at rest with AES-256-GCM via `encryptCredentials`; decrypted in `mapRow`; legacy plaintext values handled gracefully |
| `apps/gateway/src/middleware/enforce-mfa.ts` | **New** — `enforceMfaMiddleware` reads `org_auth_policies.mfa_required`; checks `enterprise_auth_sessions.mfa_verified`; returns `403 MFA_REQUIRED` when policy is enabled and session is unverified; MFA setup/verify endpoints are exempt |
| `apps/gateway/src/routes/register-api-routes.ts` | `enforceMfaMiddleware` mounted after `apiAuthUnlessPublic` on all API routes |
| `apps/gateway/src/services/enterprise/rbac.service.ts` | RBAC **on by default** — `CALLIQ_ENTERPRISE_RBAC=false` (not `!== 'true'`) to disable; userId-only guard kept |
| `apps/gateway/src/services/compliance/hipaa.service.ts` | `enableHipaaMode` now calls `assertSubprocessorBaas()` before activation; added `getSubprocessorBaaStatus`, `acknowledgeSubprocessorBaa`, `assertSubprocessorBaas` |
| `apps/gateway/src/services/redis-connection.ts` | `REDIS_PASSWORD` env var support; production/staging logs `REDIS_NO_PASSWORD` warning when Redis has no credentials |
| `supabase/migrations/044_hipaa_compliance_hardening.sql` | **New** — `REVOKE UPDATE, DELETE ON audit_logs / enterprise_audit_events FROM authenticated`; `hipaa_subprocessor_baa` table; `mfa_verified` column on `enterprise_auth_sessions`; `hipaa_enabled` on `voice_tenants`; `baa_agreements` table; `org_auth_policies` table |
| `apps/gateway/.env.example` | Added `REDIS_PASSWORD`, `REDIS_TLS`, `PG_SSL_CA`, `RECORDING_URL_TTL_SECONDS`, `CALLIQ_ENTERPRISE_RBAC` docs |

### Manual actions still required

1. **Apply migration 044** — Run `044_hipaa_compliance_hardening.sql` in Supabase SQL Editor.
2. **Set `REDIS_URL` with credentials** — Use `rediss://:password@host:port` or set `REDIS_PASSWORD` + `REDIS_TLS=true`.
3. **Set `PG_SSL_CA`** (optional but recommended) — Download Supabase root CA and point to it; otherwise system CA bundle is used with `rejectUnauthorized: true`.
4. **Acknowledge sub-processor BAAs** — For each HIPAA tenant: POST to `/api/v1/compliance/hipaa/subprocessors/:processor/acknowledge` for openai, deepgram, elevenlabs, twilio after confirming those providers have signed BAAs.
5. **Supabase storage bucket** — Set `call-recordings` bucket to **private** in Supabase Dashboard (Storage → call-recordings → Edit → Private). Signed URLs are now used but the bucket must be private to enforce them.
6. **MFA enforcement** — For HIPAA tenants, set `mfa_required = true` via `PUT /api/v1/compliance/org-auth-policy` and wire MFA verification into the Supabase Auth TOTP flow to set `mfa_verified = true` on enterprise sessions.
7. **Incident Response plan** — Document PHI breach notification procedure per HIPAA §164.400 Breach Notification Rule.
