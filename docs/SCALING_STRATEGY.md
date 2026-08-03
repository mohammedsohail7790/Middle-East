# Call IQ — Scaling Strategy

## Current Capacity

| Metric | Current | Headroom |
|--------|---------|----------|
| Concurrent calls | 50 | 100% (can handle 100 before scaling) |
| Active tenants | 100 | 500 before DB indexing review |
| API requests/min | 1000 | 5000 before rate limiting tunes |
| Storage (recordings) | 50 GB | 200 GB before archival needed |

---

## Vertical Scaling (Single Instance)

### Gateway Process

**Current limits:** 2 CPU, 1 GB RAM

**When to scale up:**
- CPU consistently > 70%
- Memory consistently > 80%
- Event loop lag > 50ms

**Scaling up plan:**
```
2 CPU / 1 GB  →  4 CPU / 2 GB  →  8 CPU / 4 GB
```

**Effect on capacity:**
| CPUs | Est. Concurrent Calls | Est. WebSockets |
|------|-----------------------|-----------------|
| 2 | 50 | 200 |
| 4 | 120 | 500 |
| 8 | 300 | 1200 |

### Database

**Current:** Supabase Micro (4 GB RAM, 2 CPU)

**When to scale up:**
- Connection pool consistently > 20
- Query latency P95 > 100ms
- Storage > 50 GB

**Supabase scaling:**
```
Micro (4GB) → Small (8GB) → Medium (16GB) → Large (32GB)
```

---

## Horizontal Scaling (Multi-Instance)

### Gateway

**Strategy:** Stateless + Redis-backed session coordination

**Architecture:**
```
         ┌──────────┐
         │  Nginx   │ (load balancer)
         │  (HA)    │
         └────┬─────┘
              │
      ┌───────┼───────┐
      │       │       │
┌─────▼┐ ┌───▼───┐ ┌─▼─────┐
│ Pod 1│ │ Pod 2 │ │ Pod N │
│      │ │       │ │       │
│Redis │ │Redis  │ │Redis  │
│Coord.│ │Coord. │ │Coord. │
└──────┘ └───────┘ └───────┘
      │       │       │
      └───────┼───────┘
              │
         ┌────▼────┐
         │  Redis  │ (shared session registry)
         │ Cluster │
         └─────────┘
```

**Key design decisions:**
- WebSocket connections are sticky via Nginx `ip_hash`
- Session state stored in Redis, not in-memory
- Heartbeat manager detects zombie sessions across pods
- Session coordinator handles orphan adoption

**Scaling out triggers:**
- Active sessions > 150 on any pod
- WebSocket connections > 200 on any pod
- CPU > 70% for > 5 minutes

**Max pods:** 10 (limited by Redis connection limits)

### Database Connection Pooling

**Strategy:** Supabase connection pooler (port 6543)

```
Pool size: 5 → 15 → 30 connections
```

Transaction pooling is preferred for gateway (no prepared statements):
```env
DATABASE_URL=postgresql://user:pass@aws-0-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
```

---

## Caching Strategy

### Redis Cache Tiers

| Tier | TTL | Use Case | Size |
|------|-----|----------|------|
| L1 (in-memory LRU) | 60s | Tenant config, plan info | 1000 entries |
| L2 (Redis) | 300s | Knowledge base queries, analytics | 5000 entries |
| L3 (DB) | ∞ | Call records, transcripts | Unlimited |

### Cache Invalidation

| Event | Cache Action |
|-------|-------------|
| Tenant config update | Invalidate L1 + L2 for tenant |
| Knowledge base change | Invalidate KB query cache |
| Plan change | Invalidate billing cache |
| New call | Invalidate active call count |

---

## OpenAI Rate Limiting

**Current model:** `gpt-4o-mini` (Realtime API)

**Limits:**
- Tier 1: 10 concurrent sessions (default)
- Tier 2: 20 concurrent sessions (after limit increase request)
- Tier 3: 50 concurrent sessions (enterprise)

**Mitigation strategy:**
- Round-robin across multiple API keys
- Queuing via BullMQ when limits hit
- Fallback model on rate limit errors
- Pre-warm connections pool

**Cost optimization:**
- Monitor token usage per call
- Set max tokens per session (default: 5000)
- Enable audio compression
- Cache frequent knowledge base queries

---

## Monitoring Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Active sessions | > 100 | > 150 | Scale out |
| CPU | > 60% | > 80% | Scale up/out |
| Memory | > 70% | > 85% | Scale up |
| Event loop lag | > 50ms | > 100ms | Investigate |
| GC pause | > 100ms | > 500ms | Optimize memory |
| Redis memory | > 70% | > 85% | Scale Redis |
| DB connections | > 15 | > 25 | Scale DB |
| Error rate | > 1% | > 5% | Rollback |
| OpenAI latency | > 2s | > 4s | Fallback |
| Twilio stream drops | > 2% | > 5% | Investigate |
