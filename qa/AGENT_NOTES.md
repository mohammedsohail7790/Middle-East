# Agentic QA Notes

## Iteration 1 — Findings

### Root causes

1. **Leads empty after calls** — Post-call path stored calls but did not call `storeLead()`. Appointments did not create lead rows unless `create_lead` tool ran explicitly.
2. **Calendar `tenant_id` / empty events** — `calendar.service` queried appointments via a separate PG pool; voice pipeline writes via `voiceDb` (`DATABASE_URL`). Events could be missing or schema errors on misaligned DBs.
3. **Team `column "name" does not exist`** — `automation.service` selected `name` from `team_members` (column is `full_name`).
4. **Analytics funnel/export** — Gated to Enterprise only; Professional/trial users saw only partial metrics.
5. **Lead status updates** — `UPDATE` returned non-existent `metadata` column; `appointment_set` not in DB check constraint on some tenants.

### Fixes applied

- Post-call and post-appointment `storeLead()` in realtime gateway/tools.
- Calendar upcoming events via `voiceDb`; relaxed time window for same-day appointments.
- Team queries: `COALESCE(full_name…)`, `is_active` instead of `status`.
- Analytics: Professional/trial funnel+export; analytics/SMS services use `voiceDb`.
- Migration `023_dashboard_data_flow.sql` for schema alignment.
- Agent voice preview sends tone, language, rules to OpenAI TTS.

### User action

Run in Supabase SQL editor:

`supabase/migrations/023_dashboard_data_flow.sql`

Redeploy gateway after pull.

## Iteration 2 — Playwright flow suites

- Added `dashboard-dataflow`, `callflow`, `workflow` specs + `api/gateway-dataflow`.
- `playwright.config.ts` starts gateway + dashboard; forces local gateway URL for E2E.
- **Chromium run:** 2 passed (health), 23 skipped (no `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` in env).
- Full authenticated run blocked until credentials are set in `apps/dashboard/.env.local`.
- Report: `qa/FINAL_REPORT.md`
