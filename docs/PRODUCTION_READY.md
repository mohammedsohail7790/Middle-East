# Production readiness checklist

## Run on Supabase (in order)

1. `016_trial_subscription_billing.sql` (optional if using 019 bootstrap)
2. `017_minutes_accounting_duration_seconds.sql`
3. `018_minutes_accounting_full_schema.sql`
4. `019_trial_warnings_and_plans.sql` — trial tables + warning types
5. `021_phone_agent_routing.sql` — phone → AI agent routing
6. `022_billing_warnings_rls_fix.sql` — RLS policy fix

## Deploy

1. **Gateway** — Redeploy from `main`
2. **Dashboard** — Redeploy
3. **Env** — `OPENAI_API_KEY`, Twilio, `DATABASE_URL`, Redis, Stripe keys, `APP_URL`, `DASHBOARD_URL`
4. **Stripe webhook** — `POST https://<gateway>/api/v1/billing/webhook` (raw body route)

Optional OAuth: `PIPEDRIVE_CLIENT_ID`, `PIPEDRIVE_CLIENT_SECRET`, HubSpot, Salesforce, etc.

## Features shipped in this release

| Area | Behavior |
|------|----------|
| Trial | 14 days OR 60 cumulative minutes; warnings at 40/50/55/58 |
| Trial end | Calls blocked; dashboard locked (billing + analytics open) |
| Multi-number | Plan limits 1 / 3 / 20 phones |
| Multi-agent | `ai_agents` + assign per number → live call uses that agent |
| Stream security | Per-call `streamToken` in Twilio parameters |
| Integrations | Paused when trial locked |
| Automations | Paused when trial locked |
| Pipedrive | OAuth connect flow |
| Simulator | Dashboard voice preview |
| Stripe | Checkout upgrade, Customer Portal, payment_failed handling |

## Smoke test

1. Signup → onboarding → auto trial
2. AI Agent save → call within 30s hears update
3. Create agent → assign on Phone Numbers → call that number
4. Burn 40+ min → see banner warning
5. Expire trial → locked overlay → Stripe checkout
6. Paid subscription → calls work again
