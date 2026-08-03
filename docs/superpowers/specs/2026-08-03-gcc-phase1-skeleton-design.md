# Phase 1: GCC Platform Skeleton & Architecture

**Status:** Approved for implementation
**Scope:** Structural foundation only — navigation/IA, design system, i18n/RTL, DB schema. No live third-party integrations (WhatsApp Business API, Instagram/Facebook Graph API) — those are later phases.

## Context

Call IQ is being repositioned from "AI Receptionist for HVAC" (US market) to an AI Customer Experience Platform for GCC businesses (UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman). This repo (`E:\Call_IQ`, now pushed to `github.com/mohammedsohail7790/Middle-East` as a fresh single-commit baseline) is the working copy for that transformation. The original US product continues elsewhere; this is a fork, not a shared deployment.

Stack (verified, not assumed): Node.js/TypeScript npm-workspaces monorepo. `apps/gateway` (Node/TS, Twilio+Deepgram+ElevenLabs+OpenAI), `apps/dashboard` (Next.js 14 App Router), `apps/worker`, `packages/{db,types,memory,mcp-client}`, Supabase Postgres with pgvector.

An audit (read-only, see conversation) found substantially more existing infrastructure than the original brief assumed:

| Area | Reality |
|---|---|
| Multi-agent voice config | `ai_agents` table exists (migration 012/021): name, role, system_prompt, voice_id, tone, services, max_duration_seconds, transfer_on_timeout/number, knowledge_category, active. Live UI at `/dashboard/agent` (per-number agents). **Missing columns**: industry, business_hours, escalation_rules, greeting, fallback_message. |
| Knowledge base / RAG | Fully live: `knowledge_base` table + pgvector, PDF/DOCX/website ingestion UI at `/dashboard/knowledge`. No work needed. |
| Automations | `automation/page.tsx` (375 lines, trigger/action/template rules engine) exists but is **orphaned** — not in `dashboard-nav.ts`. Separately, Zapier/Slack/Google Calendar are fully wired into `/dashboard/integrations`. Make.com is genuinely missing. |
| Quality / Sentiment | `quality/page.tsx` (126 lines) has real sentiment scoring (QAReview: sentiment, sentiment_score, call_success, lead_quality) but is **orphaned** from nav. |
| CRM | Missing entirely beyond `leads` and `appointments` tables — no pipeline, deals, companies, contacts. |
| i18n / RTL | Missing entirely — no next-intl/i18next, no `[locale]` routes, no `dir="rtl"` anywhere. |
| Industry field | Real column `voice_tenants.industry` (migration 014, default `'hvac'`, plain TEXT, no enum constraint). Backed by a full 50-template system in `apps/gateway/src/services/industry/{templates.ts,extended-templates.ts}` (8 detailed + 42 generated), served live via `GET /tenants/industries`, consumed by the onboarding picker (which has its own 8-item hardcoded fallback for when that API call fails). Already covers most of the brief's vertical list. **Not a DB table** — industries are TypeScript data, not rows. |
| Dashboard overview | Real: conversion rate, active/total calls, leads, avg latency/duration. **Missing**: revenue, sentiment (data exists in `quality/page.tsx`, just not surfaced on overview), top-performing-agents. |
| `sms`, `team` routes | Dead 5-line redirects, not real pages. |
| `msp_tenants` | Live parent-child reseller/white-label mechanism (`apps/gateway/src/services/msp/msp.service.ts`). Not touched by this phase — semantics need a closer read before ever reusing for GCC region-tenancy. |
| Migrations | `supabase/migrations/`, numbered 001–063 (some duplicate numbers at 044/045). Next migration starts at 064. |

## Goals

1. Give every subsequent phase (Voice Agents, Channels, CRM, Analytics, Automations, Industry Templates) a consistent navigational, visual, and data-model home to build into.
2. Do this additively — no existing table, column, API route, or page behavior changes. Orphaned-but-real pages get re-linked, not rebuilt.
3. No breaking changes to existing US-market functionality (this fork keeps it as a base to build from, even though it's now diverging).

## Non-goals (explicitly later phases)

- Actual WhatsApp/Instagram/Facebook API wiring (channel pages ship as structural skeletons with a "not connected" state)
- RAG/embedding changes (already works)
- Make.com integration
- Populating industry template *content* (prompts/greetings per vertical) — only the schema and picker UI ship now
- Reworking `msp_tenants` for regional tenancy

## Design

### A. i18n / RTL foundation

- Add `next-intl`, restructure `apps/dashboard/src/app` under a `[locale]` segment (`en`, `ar`), default `en`, middleware-based locale detection with a manual switcher (not auto-redirect-only, since GCC users may prefer to override browser locale).
- `<html dir="rtl">` when locale is `ar`, via root layout; Tailwind config gets logical-property utilities enabled (`ps-`, `pe-`, `ms-`, `me-` instead of `pl-`/`pr-`/`ml-`/`mr-` going forward — existing pages keep physical properties until touched by later phases).
- Message catalogs: seed `messages/en.json` from a first-pass extraction of dashboard nav labels, page titles, and common UI strings (buttons, empty states). Full string coverage is NOT a Phase-1 goal — the infrastructure and the nav/shell must be bilingual; deep page-content translation happens as each page is touched in later phases.
- `voice_tenants` gets no new locale column — `default_language` already exists and is reused for the dashboard's UI locale default per tenant.

### B. Design system pass

Verified: `apps/dashboard/tailwind.config.js` already has a full semantic token system (background/foreground/card/popover/primary/secondary/muted/accent/destructive/success/warning/border/input/ring/glass/chart/sidebar, all CSS-variable-backed), dark mode via `darkMode: "class"` with a working localStorage-driven init script in `layout.tsx`, custom radius/shadow tokens. **This is already enterprise-grade — no rework needed.** The only real gap: `fontFamily.sans` is `Inter`, which doesn't cover Arabic glyphs. Add `IBM Plex Sans Arabic` (or `Noto Sans Arabic`) as a `next/font/google` import, applied via a `font-arabic` class toggled by the root layout when locale is `ar` (folds into the i18n layout work, not a separate pass).

### C. Navigation / IA rebuild (`dashboard-nav.ts`)

Re-link orphaned pages, add new skeleton sections, keep every existing live item:

- **Voice Agents** (rename from "AI Agent"): existing `/dashboard/agent` page, extended with new fields (see schema below) as the page grows in a later phase. Phase 1 just does the schema + nav label.
- **Channels** (new group): Calls (existing, relink), SMS (existing route is dead — build a real minimal page backed by existing SMS capability if the gateway has one, otherwise skeleton + "coming soon"), WhatsApp / Web Chat / Instagram / Facebook (new skeleton pages, "not connected" empty state, no API wiring).
- **CRM** (new group): Pipeline, Contacts, Companies, Deals — skeleton pages with schema-backed empty states (real tables, no business logic yet beyond CRUD-list).
- **Automations**: re-link existing `automation/page.tsx` into nav (verify it still works standalone first), sits alongside existing Integrations (Zapier/Slack/Calendar) rather than replacing it.
- **Quality**: re-link existing `quality/page.tsx` into nav; its sentiment data also feeds the new dashboard overview sentiment widget.
- **Knowledge Base**: relabel nav item from "Business Profile" to "Knowledge Base" (page already does what's needed).
- **Settings**: add industry template picker (extend existing 8-option list to full GCC vertical list from the brief) and currency/timezone controls (timezone already exists on `voice_tenants`; currency is new).
- Dead `team` redirect: leave as-is (redirects to `/dashboard/settings`, which already has team-ish content per that redirect's intent) — not in scope to build a real team page this phase.

### D. Database schema additions (migration `064_gcc_phase1_skeleton.sql`, additive only)

- `ai_agents`: add `industry text`, `business_hours jsonb`, `escalation_rules jsonb`, `greeting text`, `fallback_message text`.
- `voice_tenants`: add `currency text default 'USD'`, extend `industry` check-constraint/enum (if one exists — verify during implementation) to include the GCC vertical list.
- New tables: `crm_companies`, `crm_contacts`, `crm_deals`, `crm_pipeline_stages` (tenant-scoped), `channel_connections` (tenant_id, channel type enum, status, config jsonb — the structural home for WhatsApp/IG/FB connection state once a later phase wires the real APIs).
- No new `industry_templates` table — superseded by the finding above. Instead, add missing GCC verticals (hospital, beauty_clinic, plastic_surgery, hotel, car_dealer, finance, consulting, ecommerce, travel_agency, government_services) as new `IndustrySeed` entries in `apps/gateway/src/services/industry/extended-templates.ts`, following the exact existing pattern (id/name/description/icon/services/trade). The 8 core hand-written templates in `templates.ts` are untouched (they hardcode USD amounts in prompt text tied to the US product — out of scope to edit).
- All new tables get RLS policies matching the real pattern used by `ai_agents` (migration 012): `tenant_id IN (SELECT tenant_id FROM team_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))` — not a `voice_tenants`-ownership subquery, which is a different (older) pattern used elsewhere in the schema.

### E. Dashboard overview widgets

- **Revenue**: new widget, computed from existing `minutes_accounting`/`subscriptions` billing data where derivable; if GCC revenue attribution needs deal-close data from the new CRM tables, ship as zero-state until CRM has real data — do not fabricate a number.
- **Sentiment**: pull aggregate from `quality/page.tsx`'s existing QAReview data — this is genuinely available now, not a zero-state.
- **Top Performing Agents**: rank by existing `ai_agents` + call outcome data (calls handled, conversion) — real once multi-agent data exists per tenant; zero-state for single-agent tenants.

## Testing

- Existing Vitest/Playwright suites must continue passing (additive schema/nav changes shouldn't break current flows).
- New CRM CRUD skeleton pages get basic render/empty-state tests, not full integration tests (no business logic yet to integration-test).
- i18n: smoke test that both `/en` and `/ar` locale roots render the dashboard shell without crashing, and that `dir="rtl"` is actually applied for `ar`.

## Migration / breaking changes

- One new additive migration (`064_gcc_phase1_skeleton.sql`). No existing column types change, no existing data touched.
- No existing API routes change signature.
- No existing page removed; only re-labeled (Business Profile → Knowledge Base) or newly linked into nav (Automations, Quality).
