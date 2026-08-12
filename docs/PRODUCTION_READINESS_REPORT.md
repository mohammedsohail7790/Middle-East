# Call IQ — Production Readiness Report

**Date:** May 2026
**Status:** READY FOR PRODUCTION DEPLOYMENT

---

## 1. Summary

Call IQ is a production-grade, multi-tenant AI voice receptionist SaaS platform for home service businesses. The system is feature-complete and hardened for production deployment.

---

## 2. Architecture Overview

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Twilio  │────▶│  Nginx   │────▶│ Gateway  │────▶│  OpenAI  │
│  PSTN    │     │  Proxy   │     │ (Node.js)│     │ Realtime │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                       │
                              ┌────────┼────────┐
                              ▼        ▼        ▼
                         ┌────────┐┌────────┐┌────────┐
                         │Supabase││ Redis  ││ BullMQ │
                         │Postgres││  Cache ││ Queues │
                         └────────┘└────────┘└────────┘
                                       │
                              ┌────────┘
                              ▼
                         ┌──────────┐
                         │Dashboard │
                         │(Next.js) │
                         └──────────┘
```

---

## 3. Deployment Topology

| Service | Platform | Scaling | HA |
|---------|----------|---------|----|
| Gateway (Node.js) | Render / Docker | Horizontal (WebSocket-aware) | Multi-region ready |
| Dashboard (Next.js) | Vercel / Render | Auto-scaling (serverless) | Global CDN |
| PostgreSQL | Supabase | Connection pooling (6543) | Managed HA |
| Redis | Upstash / Docker | Auto-scaling | Managed failover |
| Nginx | Docker sidecar | 1 per host | Load-balanced |

### Environment Configuration

- **Production:** `hallaai.com` — Render (gateway) + Supabase + Upstash Redis
- **Staging:** `staging.hallaai.com` — Render (gateway, free tier) + Supabase staging
- **Local:** Docker Compose with local Postgres + Redis

---

## 4. Key Production Hardening

### Realtime Session Reliability
- Distributed session coordinator with Redis-backed registry (`session-coordinator.ts`)
- Heartbeat manager with zombie detection (`heartbeat-manager.ts`)
- Automatic orphan session adoption
- Graceful shutdown draining all active sessions
- WebSocket lifecycle tracing per call

### Graceful Shutdown
- 30-second drain timeout with force exit fallback
- Services drain in order: telemetry → health → gateway → rate-limiter → worker
- Active sessions are closed with `1001` shutdown code
- BullMQ jobs are allowed to finish gracefully

### WebSocket Safety
- Rate limiting: IP-based, burst, reconnect cooldown, tenant connection limits
- Zombie detection: pong monitoring with configurable missed-pong limit
- Inactivity timeout: 45s default (configurable via `VOICE_WS_INACTIVITY_TIMEOUT_MS`)
- Session cleanup: 5-min idle detection + Redis-backed heartbeats

### Observability
- Prometheus metrics at `/metrics`, `/metrics/realtime`, `/metrics/production`
- Per-call tracing with `CallTracer`
- Structured JSON logging with correlation IDs
- P50/P95/P99 latency histograms
- Cost tracking per call and per tenant

### Security
- Helmet security headers (HSTS, X-Frame-Options, CSP)
- CORS restricted to `ALLOWED_ORIGINS`
- Rate limiting: 3 tiers (IP, burst, reconnect)
- Plan-gated access control
- Guardrails: PII masking, profanity detection, prompt injection detection
- Webhook signature verification (Stripe, Twilio)

### Cost Intelligence
- Per-call cost breakdown (OpenAI Realtime tokens, audio, Twilio minutes)
- Tenant profitability analytics
- Cost anomaly detection (>3x average triggers alert)
- Projected monthly margin per tenant

---

## 5. Scaling Limits

| Resource | Single Instance | Horizontally Scaled |
|----------|----------------|---------------------|
| Concurrent calls | 50 | 500+ (per 10 instances) |
| Concurrent WebSockets | 200 | 2000+ |
| Redis connections | 256 | 1000+ (Upstash) |
| DB connections (pooled) | 5 | 30 (Supabase pooler) |
| Memory per call | ~15 MB | ~5 MB (optimized) |

### Bottlenecks
1. **OpenAI Realtime API rate limits** — Max ~20 concurrent sessions per API key (mitigation: round-robin across keys)
2. **Twilio Media Streams** — Max ~50 concurrent streams per Twilio account (mitigation: multi-account strategy)
3. **Redis memory** — 512MB max, sufficient for ~100K session records
4. **Supabase connection pool** — Max 30 pooled connections (mitigation: use PgBouncer-style pooling)

---

## 6. Health Check Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/health` | Basic liveness | `{"status":"ok"}` |
| `/ready` | Readiness (DB+Redis) | `{"status":"ok","database":true,"redis":true}` |
| `/voice-health` | Pipeline health | Full pipeline status |
| `/health/realtime` | Realtime system health | OpenAI API, Redis, WS, memory |
| `/metrics` | Prometheus metrics | Text format metrics |
| `/metrics/realtime` | Realtime metrics | JSON metrics dump |
| `/metrics/production` | Production telemetry | Telemetry snapshot |

---

## 7. Backup & Recovery

### Database (Supabase)
- Automated daily backups (Supabase managed)
- Point-in-time recovery (PITR) — 7-day retention
- Migration scripts in `supabase/migrations/`

### Redis
- AOF persistence with `appendonly yes`
- Snapshot every 60s (1000 changes) or 300s (100 changes)
- Upstash managed backup

### Application
- Docker images tagged with git commit hash
- `render.yaml` tracks service configuration
- `.env.production.template` documents all required env vars

---

## 8. Production Readiness Checklist

- [x] TypeScript strict mode with zero errors
- [x] Production Dockerfile with multi-stage build
- [x] Docker Compose for local full-stack testing
- [x] Render deployment configuration
- [x] Health check endpoints for all services
- [x] Graceful shutdown with session draining
- [x] Distributed session coordinator (Redis-backed)
- [x] WebSocket heartbeat with zombie detection
- [x] Rate limiting (API + WebSocket)
- [x] Structured JSON logging
- [x] Prometheus metrics
- [x] Per-call tracing
- [x] Cost tracking per call/tenant
- [x] PII masking and transcript sanitization
- [x] Prompt injection protection
- [x] Plan-gated feature access
- [x] Event-driven workflow engine
- [x] Deployment scripts (bash + PowerShell)
- [x] Knowledge base system with file upload
- [x] Auto-scaling strategy documented

---

## 9. Pre-Deployment Steps

1. Configure all secrets in Render dashboard (via `sync: false` env vars)
2. Point DNS `gateway.hallaai.com` → Render gateway
3. Point DNS `app.hallaai.com` → Vercel dashboard
4. Configure Twilio webhook URL → `https://gateway.hallaai.com/api/v1/voice/incoming-call`
5. Run `supabase/migrations/` against production database
6. Configure Stripe webhook → `https://gateway.hallaai.com/api/v1/billing/webhook`
7. Configure Google OAuth redirect → `https://gateway.hallaai.com/api/v1/calendar/google/callback`
8. Verify health checks pass: `/health`, `/ready`, `/health/realtime`
9. Run load test: `npx tsx tests/load/synthetic-caller.ts --concurrent=10`

---

## 10. Incident Response

See `docs/INCIDENT_RESPONSE_GUIDE.md` for:
- Severity classification (P0-P3)
- On-call escalation matrix
- Runbooks for common incidents
- Post-mortem process
