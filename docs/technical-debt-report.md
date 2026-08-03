# Call IQ — Technical Debt Report

**Generated:** 2026-06-14

---

## Summary

After two full hardening sprints, Call IQ has eliminated the majority of critical and high-severity technical debt. This report documents what remains, categorized by impact and effort.

**Debt Score Before Sprints:** ~320 points (estimated)  
**Debt Score After Sprints:** ~95 points (estimated)  
**Debt Eliminated:** ~70%

---

## Remaining Debt by Category

### Architecture Debt

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| Call transcripts stored inline in `calls.transcript TEXT` | Medium — at 10k calls, rows become large; slow list queries | Medium (migration + S3/storage) | P2 |
| WebSocket sessions in in-process Map — no horizontal scaling | High at scale | High (Redis-backed session redesign) | P1 |
| Integration sync thundering herd (all tenants every 2 min) | Medium — spikes at scale | Medium (per-tenant scheduling) | P2 |
| `@call-iq/types` package unused by gateway | Low — dead weight | Low (cleanup) | P3 |
| `packages/db` GravityDB stub — never used in production | Low — confusion risk | Low (delete file) | P3 |
| Double API mount: `/api` + `/api/v1` | Low — rate limit bypass risk | Low (remove `/api` mount) | P2 |

### Database Debt

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| Duplicate migration prefixes (010, 017, 018, 019, 020) | Medium — schema state unclear | Low code, Medium ops | P1 |
| Automation rules use `current_setting()` RLS pattern | Medium — may silently deny access | Medium (rewrite policies) | P2 |
| No soft-delete on calls/leads/appointments | Low — hard to recover deleted data | Medium | P3 |
| Missing created_by tracking on most tables | Low — audit completeness | Low | P3 |

### Security Debt

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| `/metrics/*` endpoints no auth in non-production | Low — internal data exposure in staging | Low | P2 |
| Config reload uses hardcoded 'essential' plan for tool list | Medium — paid plan tools removed during mid-call reload | Low | P1 |
| SCIM sync hard-capped at 500 users | Medium — enterprise tenants miss users | Low (add pagination) | P2 |
| `catch (e: any)` in 4+ dashboard pages | Low — TypeScript safety | Low | P3 |

### Code Quality Debt

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| `@call-iq/types` package never imported by gateway | Low — dead dependency | Low | P3 |
| `events/shadow-verification.ts` — imported but likely dead | Low | Low (verify + delete) | P3 |
| 224 `console.log` calls in gateway source | Low — log noise | Low (replace with logger) | P3 |
| Duplicate plan definitions (`plan-config.ts` + inline in `billing.service.ts`) | Medium — can drift | Low (merge) | P2 |
| `as any` casts in `dashboard-cache.ts`, `dashboard-bootstrap.ts` | Low | Low (add typed interfaces) | P3 |
| No per-page loading.tsx skeleton loaders in most dashboard pages | Medium — UX | Medium | P2 |

### Missing Features Debt

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| No SOC 2 compliance framework | High — blocks enterprise contracts | Very High | P1 |
| No mobile app | Medium — missing channel | Very High | P2 |
| WhatsApp/Telegram channel | Medium — competitor parity | High | P2 |
| Google/Microsoft OAuth: code built, awaiting credentials | High — signup friction | Low (configure Supabase) | P1 |
| Outbound calling campaigns | Medium — revenue feature | High | P3 |
| Voicemail-to-text pipeline | Medium — feature completeness | Medium | P2 |

---

## Quick Wins (< 1 day each)

1. **Remove `/api` double-mount** (`index.ts` line 484) — 5 min fix
2. **Delete `packages/db/src/index.ts` GravityDB constructor body** — done
3. **Fix mid-call plan key bug** in `realtime.gateway.ts` — pass `tenantConfig.planKey` instead of `'essential'`
4. **Configure `SENTRY_DSN`** on Render — 5 min, zero code change
5. **Enable Google OAuth** in Supabase dashboard — 15 min (code already built)
6. **Merge duplicate plan config** — consolidate to `plan-config.ts` single source

---

## 30-Day Debt Reduction Roadmap

**Week 1:** SOC 2 prep kickoff + fix mid-call plan key + configure monitoring  
**Week 2:** Transcript storage migration + WebSocket Redis-backed sessions (design doc)  
**Week 3:** Integration sync per-tenant scheduling + SCIM pagination  
**Week 4:** Duplicate migration rename + type safety improvements
