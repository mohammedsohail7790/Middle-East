# Call IQ — Deployment Runbook

## Production Deployment

### Prerequisites
- Render CLI or dashboard access
- Supabase project credentials
- OpenAI API key
- Twilio account SID + auth token
- Stripe secret + webhook keys
- DNS access for `api.calliqlabs.com` and `www.calliqlabs.com`

### Step 1: Verify Build

```bash
# Local build verification
npm ci
npm run build:packages
npm run build:gateway
npm run build:dashboard

# TypeScript check
npx tsc --noEmit
```

### Step 2: Deploy Gateway

**Via Render Dashboard:**
1. Push to `main` branch (auto-deploy enabled)
2. Monitor build logs at `https://dashboard.render.com/web/srv-xxx`
3. Verify health: `curl https://api.calliqlabs.com/health`
4. Verify readiness: `curl https://api.calliqlabs.com/ready`

**Via Render API:**
```bash
curl -X POST "https://api.render.com/deploy/srv-{GATEWAY_SRV_ID}?key={DEPLOY_HOOK_KEY}"
```

### Step 3: Deploy Dashboard

**Via Render Dashboard:**
1. Push to `main` branch (auto-deploy enabled)
2. Monitor build logs at `https://dashboard.render.com/web/srv-yyy`
3. Verify: open `https://www.calliqlabs.com` in browser

### Step 4: Run Migrations

```bash
node run-migration.js supabase/migrations/017_knowledge_files.sql
node run-migration.js supabase/migrations/018_call_costs.sql
node run-migration.js supabase/migrations/019_onboarding_progress.sql
```

### Step 5: Configure Webhooks

| Webhook | URL | Secret |
|---------|-----|--------|
| Twilio Voice | `https://api.calliqlabs.com/ws/realtime/` | None |
| Twilio Status | `https://api.calliqlabs.com/api/twilio/status` | None |
| Stripe | `https://api.calliqlabs.com/api/v1/billing/webhook` | `STRIPE_WEBHOOK_SECRET` |
| Google OAuth | `https://api.calliqlabs.com/api/v1/calendar/oauth/callback` | `GOOGLE_CLIENT_SECRET` |

### Step 6: Post-Deploy Verification

```bash
# Health checks
curl -f https://api.calliqlabs.com/health
curl -f https://api.calliqlabs.com/ready
curl -f https://api.calliqlabs.com/health/realtime

# Full system check
curl -f https://api.calliqlabs.com/voice-health

# Metrics endpoint
curl https://api.calliqlabs.com/metrics | head -20

# Dashboard
curl -f https://www.calliqlabs.com/api/health
```

---

## Staging Deployment

Same as production but:
- Use staging env vars: `deploy.sh staging all`
- Verify at `https://staging.calliqlabs.com`
- Use test Stripe keys (sk_test_xxx)
- Use Twilio test credentials

---

## Rollback Procedure

### Gateway Rollback
1. In Render dashboard → gateway → "Manual Deploy" → "Deploy previous version"
2. Select last known good deploy
3. Wait for health check pass
4. Verify: `curl -f https://api.calliqlabs.com/health`

### Database Rollback
1. Identify the migration to roll back
2. Create a reverse migration SQL file
3. Run: `node run-migration.js rollback-migration.sql`
4. Verify: Check data integrity in Supabase console

### Full Rollback
```bash
# Go to specific commit
git checkout <last-known-good-commit>
npm ci
npm run build:packages
npm run build:gateway
deploy.sh production gateway
```
