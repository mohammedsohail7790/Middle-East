# Call IQ — SLA Architecture

## Service Level Objectives

| Metric | Target | Measurement |
|--------|--------|-------------|
| Gateway uptime | 99.9% | Monthly average |
| Call audio latency (P95) | < 2s end-to-end | Per-call measurement |
| Call setup time | < 5s | From Twilio webhook to first greeting |
| API response time (P95) | < 500ms | Excluding WebSocket routes |
| Knowledge base search | < 500ms | P95 |
| WebSocket uptime | 99.5% | Per-session measurement |

## Availability Architecture

### Multi-Region Strategy (Future)
```
Region: us-west (primary)    Region: us-east (failover)
┌────────────────────┐       ┌────────────────────┐
│  Render (oregon)   │       │  Render (frankfurt)│
│  Gateway + Redis   │──────▶│  Gateway + Redis   │
│  Supabase (us-west)│       │  Supabase (us-east)│
└────────────────────┘       └────────────────────┘
```

### Component SLA

| Component | SLA | Dependency | Mitigation |
|-----------|-----|------------|------------|
| Render (gateway) | 99.97% | Cloud infrastructure | Multi-region deployment |
| Render (dashboard) | 99.97% | Cloud infrastructure | Static fallback page |
| Supabase | 99.95% | Managed PostgreSQL | Connection pooling, retry |
| Upstash Redis | 99.99% | Managed Redis | Local Redis fallback |
| OpenAI Realtime | 99.9% | OpenAI API | Retry + fallback model |
| Twilio | 99.95% | Twilio API | Failover phone numbers |

### Degradation Modes

| Component Failure | System Behavior | User Impact |
|-------------------|-----------------|-------------|
| Gateway process down | Calls rejected at Twilio level | Missed calls |
| Redis unavailable | Session registry degraded, heartbeat disabled | Limited to 1:1 session tracking |
| Supabase down | Analytics/history unavailable, calls continue | Dashboard outage only |
| OpenAI API down | Fallback greeting played, calls logged | Callers get voicemail |
| Twilio down | No calls can route | Complete inbound outage |

## Monitoring & Alerting

### Health Check Cadence
| Check | Interval | Action on Failure |
|-------|----------|-------------------|
| `/health` (gateway) | 15s | Auto-restart (Render) |
| `/ready` (DB+Redis) | 30s | Log alert, degrade gracefully |
| `/health/realtime` | 60s | Alert if OpenAI/Redis failing |

### Alert Thresholds
| Metric | Warning | Critical | Response |
|--------|---------|----------|----------|
| Active sessions > 150 | Slack | PagerDuty | Scale out |
| OpenAI latency P95 > 3s | Slack | PagerDuty | Investigate |
| Drop call rate > 5% | Slack | PagerDuty | Emergency fix |
| Redis memory > 80% | Slack | Slack | Scale up |
| Error rate > 1% | Slack | PagerDuty | Rollback |

## Business Continuity

### Database Backup
- Supabase automated daily backups
- Point-in-time recovery: 7 days
- Schema migrations: All in `supabase/migrations/`

### Deployment Safety
- Zero-downtime deploys via Render
- Health check gate before traffic routing
- Auto-rollback on health check failure
- Canary deploys for gateway changes

### Disaster Recovery
- RTO (Recovery Time Objective): 15 minutes
- RPO (Recovery Point Objective): 5 minutes
- Full redeployment from `deploy.sh` in < 30 minutes
- Secrets in Render dashboard (not in repo)

---

## Autoscaling Recommendations

### Gateway (Render)
- Min: 1 instance (starter)
- Max: 5 instances
- Scale on: CPU > 70%, Memory > 80%, Active sessions > 100
- Cooldown: 120s between scale events
- WebSocket-aware: Use instance affinity for active sessions

### Dashboard (Vercel)
- Auto-scaling handled by Vercel serverless
- ISR for static pages, SSR for authenticated pages
- Edge functions for rate-limited API routes

### Redis (Upstash)
- Current: 256 MB
- Scale trigger: Memory > 80%
- Next tier: 512 MB

### Database (Supabase)
- Current: Micro (4GB RAM)
- Scale trigger: > 50 concurrent connections
- Next tier: Small (8GB RAM)
