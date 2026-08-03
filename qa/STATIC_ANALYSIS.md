# Static Analysis (Phase 2)

**Date:** 2026-05-22

## Unit tests (`npm test`)

| Result | 59/59 passed |

## ESLint (`npm run lint -w @call-iq/dashboard`)

| Status | **PASS** (fixed Iteration 1 — `useCallback` on `fetchData`) |

## Typecheck (`npm run typecheck`)

| Status | **PASS** (no workspace scripts reported errors) |

## Build

| Target | Status | Notes |
|--------|--------|-------|
| Dashboard `next build` | PASS (prior run) | ESLint warning during build on analytics page |
| Gateway `node build.cjs` | PASS with warning | TS2345 in `voice-auth-unless-public.ts` — Express `Request` vs global `Request` |

## Suspicious / follow-up

- Supabase env required at runtime (`NEXT_PUBLIC_SUPABASE_*`) — pages fail without `.env.local`
- Gateway API calls from dashboard may 4xx when gateway offline — tests ignore gateway failures on happy paths
- Node v24 on host vs engines `<24` — EBADENGINE on install
- No TODO/FIXME in `apps/dashboard/src`

## Fixes queued for Iteration 1

1. Analytics `useCallback` for `fetchData` → clean lint
2. Cast Express request in `voice-auth-unless-public.ts` if needed
3. Playwright failures TBD after first run
