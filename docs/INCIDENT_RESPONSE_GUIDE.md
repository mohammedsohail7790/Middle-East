# Call IQ — Incident Response Guide

**Severity Levels:** P0 (Critical) → P3 (Minor)

---

## Severity Matrix

| Severity | Definition | Response Time | Examples |
|----------|------------|---------------|----------|
| **P0** | Complete service outage | 5 min | Gateway down, no calls routing |
| **P1** | Major feature degradation | 15 min | OpenAI API failing, calls dropping |
| **P2** | Partial degradation | 60 min | Slow responses, analytics delayed |
| **P3** | Minor issue | 24 hours | UI glitch, non-critical error in logs |

---

## Runbooks

### P0: Gateway Down

**Symptoms:** `/health` returns 5xx, all calls failing

**Immediate Actions:**
1. Check Render dashboard → gateway service logs
2. `curl -f https://gateway.hallaai.com/health`
3. Check if gateway process crashed: look for OOM kill in logs
4. Check upstream services: `curl -f https://api.openai.com/v1/models` (OpenAI)

**Resolution:**
- If OOM: Increase memory limit in `render.yaml` → redeploy
- If OpenAI failure: Check API key validity in Render env vars
- If unknown: Restart gateway service in Render dashboard
- If persistent: Rollback to previous deploy version

**Post-Mortem:**
- Check `process.memoryUsage()` metrics from before crash
- Review recent deploy for code changes
- Check Redis connection logs around crash time

---

### P1: Silent Calls (Audio Not Flowing)

**Symptoms:** Calls connect but no audio heard, or callers cannot hear AI

**Immediate Actions:**
1. Check WebSocket connections: `/metrics/realtime` → `activeRealtimeSessions`
2. Check Twilio stream status in Twilio console
3. Check OpenAI Realtime API logs for audio events
4. Test with a direct WS connection: `wscat -c wss://gateway.hallaai.com/ws/realtime/test-tenant`

**Resolution:**
- If OpenAI Realtime connection failing: Check `OPENAI_API_KEY` and OpenAI rate limits
- If Twilio stream not connecting: Verify `TWILIO_STREAM_WSS_URL` is correct
- If audio diag shows packet loss: Check Nginx `proxy_read_timeout` config
- If model returning no audio: Check voice configuration in `realtime.session.ts`

**Post-Mortem:**
- Review `audioDiagnosticsManager` metrics
- Check for recent changes to `realtime.gateway.ts` or `realtime.session.ts`
- Verify Twilio webhook URL is using correct WSS endpoint

---

### P1: All Calls Failing with "Capacity Reached"

**Symptoms:** New calls immediately rejected

**Immediate Actions:**
1. Check concurrency limits: `getActiveSessionCount()` in `/debug/realtime`
2. Check for zombie sessions: `sessionCoordinator.getActiveSessionsForInstance()`
3. Force cleanup: Restart gateway service
4. Check Redis `active_calls:*` keys → flush stale entries

**Resolution:**
- If session leak: Deploy with session coordinator fix, restart
- If real concurrency spike: Temporarily increase capacity guard in render.yaml
- If zombie connections: Clear Redis `calliq:session:*` keys

**Post-Mortem:**
- Review `heartbeatManager` stats for missed pongs
- Check `sessionCoordinator` zombie detection logs
- Add alerting when session count approaches limit

---

### P2: High Latency / Slow Responses

**Symptoms:** Callers wait >3s for AI responses

**Immediate Actions:**
1. Check `/metrics/realtime` → `aiLatencyMs` P95/P99
2. Check OpenAI status dashboard
3. Check Redis `SLOWLOG` for slow operations
4. Check DB query performance via Supabase logs

**Resolution:**
- If OpenAI latency: Reduce max tokens, switch to `gpt-4o-mini`
- If Redis slow: Check memory pressure, scan for `KEYS *` usage
- If DB slow: Add missing indexes, check connection pool

**Post-Mortem:**
- Review latency histograms for patterns
- Check for recently added blocking operations in hot path
- Evaluate need for Redis cluster or read replicas

---

### P2: Redis Connection Issues

**Symptoms:** Caching failures, session coordination errors

**Immediate Actions:**
1. Check Redis connectivity: `redis-cli ping`
2. Check `REDIS_URL` env var is correct
3. Verify Redis instance is running (Upstash dashboard)
4. Check for max connection limit

**Resolution:**
- If connection refused: Check firewall/network rules
- If max clients exceeded: Scale Redis instance or reduce pool size
- If auth failure: Regenerate Redis credentials

**Post-Mortem:**
- Add Redis retry strategy with backoff
- Consider Redis Sentinel for HA

---

### P3: Billing/Stripe Issues

**Symptoms:** Subscription creation failing, webhook errors

**Immediate Actions:**
1. Check Stripe dashboard for API errors
2. Verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are correct
3. Check `/api/v1/billing/webhook` logs for 400 responses
4. Verify webhook endpoint in Stripe dashboard matches deployed URL

**Resolution:**
- If key invalid: Rotate Stripe keys, update env
- If webhook failing: Check signature verification, re-register endpoint
- If price ID mismatch: Update `STRIPE_*_PRICE_ID` env vars

**Post-Mortem:**
- Add Stripe webhook event logging
- Verify price IDs match env vars

---

## On-Call Rotation

- **Primary:** 24/7 first responder (P0/P1)
- **Secondary:** Backup for primary, handles P2
- **Escalation:** Engineering lead for unresolved P0 after 30 min

## Communication

| Channel | Purpose |
|---------|---------|
| Slack #incidents | All incident notifications |
| PagerDuty | P0/P1 alerting |
| Status page | Public status updates |
| Email | P2/P3 notifications |

## Post-Mortem Process

1. Incident documented in `docs/post-mortems/YYYY-MM-DD-incident.md`
2. Timeline of events (detection → response → resolution)
3. Root cause analysis (5 Whys)
4. Action items with owners and deadlines
5. Review in weekly engineering meeting
