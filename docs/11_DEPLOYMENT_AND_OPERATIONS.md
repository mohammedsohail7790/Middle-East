# 11 — DEPLOYMENT AND OPERATIONS

## Deployment Stack

| Component | Provider | Plan | Region |
|-----------|----------|------|--------|
| Gateway | Render.com | Starter | Oregon |
| Dashboard | Render.com (or Vercel) | Starter | Oregon |
| Database | Supabase | Free/Pro | AWS us-east-1 |
| Redis | Upstash (via Render) | Free | Oregon |
| CDN/DNS | Cloudflare | Free | Global |

## Render Configuration

**File:** `render.yaml` (Infrastructure as Code)

### Gateway Service
```yaml
- type: web
  name: calliq-gateway
  env: node
  region: oregon
  plan: starter
  buildCommand: npm install && npm run build:gateway
  startCommand: npm run start:gateway
  healthCheckPath: /health
  autoDeploy: true
```

### Dashboard Service
```yaml
- type: web
  name: calliq-dashboard
  env: node
  region: oregon
  plan: starter
  buildCommand: npm install && npm run build:dashboard
  startCommand: npm run start:dashboard
  healthCheckPath: /
  autoDeploy: true
```

### Redis
```yaml
redis:
  - name: calliq-redis
    plan: free
    region: oregon
    maxmemoryPolicy: allkeys-lru
```

## Build Commands

```bash
# Gateway
npm run build:gateway  →  npm run build -w @call-iq/gateway
# Internally: node build.cjs (runs tsc)
# Output: dist/apps/gateway/src/index.js

# Dashboard
npm run build:dashboard  →  npm run build -w @call-iq/dashboard
# Internally: next build
# Output: .next/

# Full build
npm run build  →  build:packages && build:apps
```

## Start Commands

```bash
# Gateway
npm run start:gateway  →  node dist/apps/gateway/src/index.js

# Dashboard
npm run start:dashboard  →  next start
```

## Docker

**Files:** `apps/gateway/Dockerfile`, `apps/dashboard/Dockerfile`, `docker-compose.yml`

```bash
# Local development with Docker
docker-compose up -d

# Production build
docker-compose -f docker-compose.production.yml up -d
```

## Health Checks

| Endpoint | Purpose | Expected |
|----------|---------|----------|
| `GET /health` | Basic liveness | `{"status":"ok"}` (always 200) |
| `GET /ready` | Readiness (DB + Redis) | 200 if both connected, 503 otherwise |
| `GET /voice-health` | Voice pipeline | 200 if preflight passed, 503 if failed |

## Graceful Shutdown

**File:** `apps/gateway/src/services/graceful-shutdown.ts`

```typescript
// Services register for shutdown
registerService({
  name: 'production-telemetry',
  shutdown: async () => { productionTelemetry.destroy(); },
});

// On SIGTERM/SIGINT:
// 1. Stop accepting new connections
// 2. Drain active WebSocket sessions
// 3. Flush pending metrics
// 4. Close database pools
// 5. Exit
```

## Autoscaling

Render auto-scales based on:
- CPU usage
- Memory usage
- Request queue depth

**Current limits:**
- Starter plan: 1 instance, 512MB RAM, 0.5 CPU
- Standard plan: Auto-scale 1-10 instances

## Rollback Procedure

```bash
# Gateway (Render)
# Dashboard → Deploys → Select previous → "Rollback to this deploy"

# Dashboard (Vercel)
vercel rollback

# Database
# Supabase Dashboard → Backups → Point-in-time restore
# WARNING: Destructive — last resort only
```

## Deployment Checklist

1. ✅ All env vars configured in Render
2. ✅ Database migrations applied (`supabase db push`)
3. ✅ Stripe webhook endpoint registered
4. ✅ Twilio webhook URL updated
5. ✅ DNS records configured
6. ✅ SSL certificates provisioned (automatic)
7. ✅ Health check passing
8. ✅ Test call successful

## Scaling Limits (Current Config)

| Resource | Limit | Upgrade Path |
|----------|-------|--------------|
| Gateway RAM | 512MB (Starter) | Standard: 2GB |
| Concurrent calls | ~10-20 (Starter) | Standard: 50-100 |
| Database connections | ~20 (Free) | Pro: 100+ |
| Redis commands | 10K/day (Free) | Pay-as-you-go |
| Twilio concurrent | Account-level | Request increase |
| OpenAI Realtime | ~50 concurrent | Request increase |
