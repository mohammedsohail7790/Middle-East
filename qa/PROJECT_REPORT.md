# Call IQ — Project Report (Phase 0)

## Stack

| Layer | Technology |
|-------|------------|
| Monorepo | npm workspaces (`apps/*`, `packages/*`) |
| API | Express gateway (`@call-iq/gateway`, port **3003**) |
| Dashboard | Next.js 14 (`@call-iq/dashboard`, port **3000**) |
| Database | PostgreSQL via Supabase (`DATABASE_URL`) |
| Voice | Twilio + OpenAI Realtime |
| Billing | Stripe |

## Entry points

- Gateway: `apps/gateway/src/index.ts`
- Dashboard: `apps/dashboard/src/app/`
- Migrations: `supabase/migrations/*.sql`

## Key dashboard routes

- `/dashboard` — home metrics, call volume, funnel
- `/dashboard/calls`, `/leads`, `/agent`, `/calendar`, `/sms`, `/analytics`, `/automation`, `/team`, `/integrations`

## Tests

- Unit: Vitest (`npm test`)
- E2E: Playwright (`npm run test:e2e`, config at repo root)

## Dev commands

```bash
npm run dev          # gateway + dashboard
npm run dev:gateway
npm run dev:dashboard
npm run build
npm run test:e2e
```

## Config notes

- Set `DATABASE_URL` (Supabase pooler) on gateway — tenant data (calls, leads, appointments) uses this connection.
- Optional `GATEWAY_DATABASE_URL` for billing-only tables; keep aligned with `DATABASE_URL` in production.
- Run migrations through `023_dashboard_data_flow.sql` for calendar/team/leads fixes.
