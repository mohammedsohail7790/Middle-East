# E2E tests (Playwright)

## Local

```bash
npm run test:e2e:install
npm run dev:dashboard   # terminal 1 — must be on :3000 (stop other Next/prod servers first)
npm run test:e2e        # terminal 2
```

If port 3000 is taken, Next uses 3001 and tests will fail unless you set:

```bash
$env:PLAYWRIGHT_BASE_URL="http://localhost:3001"
$env:PLAYWRIGHT_SKIP_WEBSERVER="1"
```

Copy `apps/dashboard/.env.example` → `.env.local` with real Supabase keys.

## Authenticated tests

Set in the shell or `apps/dashboard/.env.local` (not committed):

```bash
E2E_TEST_EMAIL=your-test-user@example.com
E2E_TEST_PASSWORD=your-password
```

The test user must have `tenant_id` in Supabase user metadata, or tests stop at `/onboarding`.

## Flow suites (dashboard / calls / workflow)

```bash
npm run test:e2e:flows              # chromium + webkit + firefox
npm run test:e2e:flows -- --project=chromium
```

| Spec | What it validates |
|------|-------------------|
| `e2e/journeys/dashboard-dataflow.spec.ts` | Home KPIs, leads, calendar, analytics, agent — APIs & no SQL errors |
| `e2e/journeys/callflow.spec.ts` | Calls page, phone numbers, AI agent, gateway health |
| `e2e/journeys/workflow.spec.ts` | Automation rules list + create workflow modal |
| `e2e/api/gateway-dataflow.spec.ts` | Direct `/api/v1/*` metrics (needs `E2E_TENANT_ID` + `VOICE_INTERNAL_API_KEY`) |

Playwright starts **gateway (:3003)** and **dashboard (:3000)** automatically and points the dashboard at `http://localhost:3003`.

## CI (GitHub Actions)

Optional repository **secrets** (Settings → Secrets → Actions):

| Secret | Purpose |
|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Build + runtime auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build + runtime auth |
| `NEXT_PUBLIC_GATEWAY_API_URL` | API client (optional) |
| `E2E_TEST_EMAIL` | Authenticated journey tests |
| `E2E_TEST_PASSWORD` | Authenticated journey tests |

Without Supabase secrets, CI uses placeholders and runs **public-route** tests only.

## Production smoke (hallaai.com)

```bash
copy .env.e2e.example .env.e2e   # add real SMOKE_TEST_PASSWORD
npm run smoke:prod:full          # API smoke + knowledge Playwright on app.hallaai.com
```

| Script | What it runs |
|--------|----------------|
| `npm run smoke:prod` | `scripts/smoke-production.mjs` — health, knowledge APIs, SSE (with JWT) |
| `npm run test:e2e:prod:knowledge` | Playwright against live site (no local webserver) |
| `npm run smoke:prod:full` | Both |

GitHub Actions: `verify-knowledge-prod.yml` (scheduled + manual) uses repo secrets `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`.
