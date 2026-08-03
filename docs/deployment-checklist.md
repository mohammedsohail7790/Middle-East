# Call IQ — Production Deployment Checklist

**Version:** 2026-06-14  
**Platform:** Render (gateway + worker) + Vercel (dashboard) + Supabase + Redis

---

## Pre-Deployment: Environment Variables

### Gateway (Render Web Service)

```env
# === REQUIRED — service will refuse to start without these ===
DATABASE_URL=postgresql://...                    # Supabase direct connection
GATEWAY_DATABASE_URL=postgresql://...           # Optional: separate pooler URL
REDIS_URL=redis://...                           # Upstash or Redis Cloud
JWT_SECRET=<min-32-char-random-string>          # Used for WS session tokens if WS_SESSION_SECRET not set
VOICE_INTERNAL_API_KEY=<min-32-char-random>    # Internal service auth + WS session tokens
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-...

# === REQUIRED for billing ===
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# === RECOMMENDED ===
WS_SESSION_SECRET=<min-32-char-random>         # Separate WS JWT secret (best practice)
SENTRY_DSN=https://xxx@sentry.io/xxx           # Error monitoring — critical
RESEND_API_KEY=re_...                          # Email for automation triggers

# === SUPABASE ===
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# === OPTIONAL FEATURES ===
GATEWAY_RUN_WORKERS=false                       # Set true to co-locate workers (not recommended)
DEEPGRAM_API_KEY=...                            # If using Deepgram transcription
ELEVENLABS_API_KEY=...                          # If using ElevenLabs voice cloning
PG_POOL_MAX=8                                   # Default: 8. Raise to 15 at >500 tenants
NODE_ENV=production                             # Critical — affects security behavior
ALLOWED_ORIGINS=https://www.calliqlabs.com      # CORS — add dashboard domain

# === EMERGENCY OVERRIDES (leave unset in normal operation) ===
# ALLOWLIST_FAIL_OPEN=true                      # Only set during DB maintenance
# USAGE_ENFORCEMENT_FAIL_OPEN=true             # Only set during billing system outage
# CSRF_MEMORY_FALLBACK=true                    # Only set for dev/staging without Redis
```

### Worker (Render Background Worker)

Same env vars as gateway, minus Twilio/voice-specific ones. Key required:
```env
DATABASE_URL=...
REDIS_URL=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NODE_ENV=production
```

### Dashboard (Vercel/Render Static)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_GATEWAY_API_URL=https://call-iq-gateway.onrender.com
NEXT_PUBLIC_SITE_URL=https://www.calliqlabs.com
```

---

## Pre-Deployment: Database

- [ ] All Supabase migrations applied (001–046)
- [ ] Verify `public.voice_tenants` exists and has all expected columns
- [ ] Verify `public.baa_agreements` RLS enabled (`\dp baa_agreements` in psql)
- [ ] Verify `public.tenant_feature_flags` table exists (migration 046)
- [ ] Run `node scripts/validate-migrations.mjs` — zero duplicate prefixes
- [ ] Supabase "Enforce JWT" enabled for all roles in Auth settings
- [ ] Connection pool limit set appropriately (8 per pod × number of pods < Supabase max)

---

## Pre-Deployment: Third-Party Services

### Twilio
- [ ] Account SID and Auth Token configured
- [ ] Phone number purchased and configured in dashboard
- [ ] Twilio webhook URL set to: `https://call-iq-gateway.onrender.com/api/v1/voice/incoming-call`
- [ ] Status callback URL set
- [ ] Media Streams WSS URL: `wss://call-iq-gateway.onrender.com`

### Stripe
- [ ] Secret key configured
- [ ] Webhook endpoint created: `https://call-iq-gateway.onrender.com/api/v1/billing/webhook`
- [ ] Webhook events subscribed: `customer.subscription.*`, `invoice.*`, `payment_intent.*`
- [ ] Webhook signing secret configured as `STRIPE_WEBHOOK_SECRET`
- [ ] Products and prices created for Essential/Professional/Enterprise plans
- [ ] Plan price IDs added to `plan-config.ts` and `billing.service.ts`

### OpenAI
- [ ] API key with Realtime API access
- [ ] Spending limit set on OpenAI account
- [ ] Rate limit tier sufficient for expected call volume

### Sentry
- [ ] Project created at sentry.io
- [ ] DSN copied to `SENTRY_DSN` env var
- [ ] Verify errors appear in Sentry after first call

### Google OAuth (optional)
- [ ] OAuth app created in Google Cloud Console
- [ ] Client ID and Secret added to Supabase → Authentication → Providers → Google
- [ ] Test sign-in flow

### Microsoft OAuth (optional)
- [ ] App registered in Azure AD
- [ ] Client ID and Secret added to Supabase → Authentication → Providers → Azure
- [ ] Test sign-in flow

---

## Deployment Steps

### 1. Deploy Gateway

```bash
# On Render: auto-deploys on push to main
# Verify in Render logs:
# ✓ "gateway_bootstrap" log entry
# ✓ "Database connection established successfully"
# ✓ No "FATAL" or "refusing to start" messages
```

### 2. Verify Health Endpoints

```bash
curl https://call-iq-gateway.onrender.com/health
# Expected: {"status":"ok","service":"call-iq-gateway"}

curl https://call-iq-gateway.onrender.com/ready
# Expected: {"status":"ready","checks":{"database":{"ok":true},"redis":{"ok":true},...}}

# Verify security:
curl https://call-iq-gateway.onrender.com/debug/env
# Expected: 401 Unauthorized
```

### 3. Deploy Worker

```bash
# Deploy apps/worker as a separate Render Background Worker
# Start command: npm run start -w @call-iq/worker
# Verify in logs: "worker_started" with workers: ["retention","integration-sync","scim-sync"]
```

### 4. Deploy Dashboard

```bash
# Vercel: auto-deploys on push to main
# Verify: dashboard loads at https://www.calliqlabs.com
# Test: signup flow, login, dashboard access
```

### 5. Apply Database Migrations

```bash
# In Supabase SQL editor, run migrations 042-046 if not auto-applied:
# supabase/migrations/042_rls_missing_tables.sql
# supabase/migrations/043_fix_call_costs_rls.sql
# supabase/migrations/044_missing_fk_indexes.sql
# supabase/migrations/045_fix_ghost_tenants_fk.sql
# supabase/migrations/046_feature_flags.sql
```

---

## Post-Deployment Smoke Tests

- [ ] `GET /health` returns 200
- [ ] `GET /ready` shows database + redis both `ok: true`
- [ ] Sign up with email → confirmation email received → account created
- [ ] Log in → redirected to /dashboard
- [ ] Dashboard loads with no console errors
- [ ] Make a test call to your Twilio number → call is logged in /dashboard/calls
- [ ] Lead is captured from test call → visible in /dashboard/leads
- [ ] Stripe billing page loads without errors
- [ ] `/debug/env` returns 401 (not 200)

---

## Rollback Plan

If deployment fails:

1. Render: click "Rollback to previous deploy" in dashboard
2. Database: migrations are additive — no rollback needed for 042-046
3. Dashboard: Vercel keeps previous deployment available

---

## Monitoring

- **Sentry**: errors captured automatically after `SENTRY_DSN` is set
- **Render**: built-in metrics for CPU/memory/requests
- **`/ready` endpoint**: use for uptime monitoring (UptimeRobot, Better Uptime)
- **Prometheus**: `/metrics/prometheus` endpoint available with `ENABLE_PUBLIC_METRICS=true`

---

## Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| API p95 latency > 500ms | Sustained 5 min | Scale gateway to 2+ instances |
| DB pool wait > 100ms | Sustained | Increase `PG_POOL_MAX` or add read replica |
| Redis memory > 80% | Any time | Upgrade Redis plan |
| Worker queue backlog > 1000 | Sustained | Scale worker instances |
| Active WS sessions > 50 | Per instance | Enable sticky sessions |
