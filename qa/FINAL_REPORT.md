# Playwright E2E — Flow Test Report

**Date:** 2026-05-23  
**Scope:** Dashboard data flow, call flow, automation workflow, gateway API  
**Command:** `npm run test:e2e:flows -- --project=chromium`

## Summary

| Suite | Passed | Skipped | Failed |
|-------|--------|---------|--------|
| Gateway API (`e2e/api/gateway-dataflow.spec.ts`) | 2 | 6 | 0 |
| Call flow (`e2e/journeys/callflow.spec.ts`) | 1 | 5 | 0 |
| Dashboard data flow (`e2e/journeys/dashboard-dataflow.spec.ts`) | 0 | 9 | 0 |
| Workflow (`e2e/journeys/workflow.spec.ts`) | 0 | 3 | 0 |
| **Total (flows only)** | **2** | **23** | **0** |

## What ran successfully

- **Gateway `/health`** — OK (local `http://localhost:3003`)
- **`/health/realtime`** — 503 degraded (OpenAI not configured locally) — treated as acceptable
- Playwright starts **gateway + dashboard** together via `playwright.config.ts`

## Why 23 tests were skipped

Authenticated UI tests require:

```bash
# apps/dashboard/.env.local or shell
E2E_TEST_EMAIL=your-user@example.com
E2E_TEST_PASSWORD=your-password
```

Optional API-only tests (no browser login):

```bash
E2E_TENANT_ID=<uuid>
VOICE_INTERNAL_API_KEY=<gateway internal key>
```

Without these, dashboard/call/workflow journeys skip after `test.skip()`.

## New test files

| File | Covers |
|------|--------|
| `e2e/journeys/dashboard-dataflow.spec.ts` | Metrics, leads, calendar, analytics, agent — API + no error banners |
| `e2e/journeys/callflow.spec.ts` | Calls list, phone numbers, agent config, simulator |
| `e2e/journeys/workflow.spec.ts` | Automation rules CRUD UI |
| `e2e/api/gateway-dataflow.spec.ts` | Direct gateway metrics/calls/leads/calendar/team/automation |

## Run locally (full)

```powershell
cd C:\Users\User\Desktop\Call_IQ
npm run test:e2e:install

# Set credentials in apps/dashboard/.env.local:
# E2E_TEST_EMAIL=...
# E2E_TEST_PASSWORD=...

npm run test:e2e:flows
# All browsers:
npm run test:e2e
```

## Known non-blockers

- Landing page **axe** color-contrast on `/` (public smoke) — cosmetic, not data-flow
- Realtime health **503** without `OPENAI_API_KEY` in gateway env

## Artifacts

- HTML report: `qa/artifacts/playwright-report/index.html`
- JSON: `qa/artifacts/test-results.json`
- Screenshots/traces: `qa/artifacts/test-output/`

## Next step for 100% flow coverage

1. Add `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` to `apps/dashboard/.env.local`
2. Ensure test user has `tenant_id` in Supabase metadata (not stuck on `/onboarding`)
3. Re-run: `npm run test:e2e:flows`
