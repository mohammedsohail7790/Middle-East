# Phase 2: i18n / RTL Foundation (URL-based)

**Status:** Approved for implementation
**Scope:** Dashboard product surface only (`app/dashboard/**`, ~30 pages). Marketing/auth pages (about, blog, pricing, login, signup, onboarding, etc. — ~26 route folders, ~27 files) are relocated into their own route group to preserve independent root-layout `<html lang="en">`, but their *content* stays English-only this phase — no translation work.

## Context

User chose URL-based locale routing (`/dashboard` for English, `/ar/dashboard` for Arabic) over a cookie/preference-only approach, despite the larger mechanical footprint, because shareable/indexable locale URLs matter for the product even though the dashboard itself is authenticated.

Verified against the real codebase (not assumed):
- No `middleware.ts` exists today — no conflict to merge with.
- All routes currently share a single root `app/layout.tsx` (html lang="en", `Providers`, Inter font, dark/light theme-init script). There is no meaningful existing "multiple root layouts" split — the `(marketing)/layout.tsx` file that exists today is a dead passthrough (`export default function MarketingLayout({children}) { return children; }`) not actually wrapping any pages, since the ~26 marketing/auth route folders are direct siblings of `app/`, not children of `(marketing)/`.
- Auth/session gating in `dashboard/layout.tsx` is client-side (`supabase.auth.getSession()`), not middleware-based — no interaction with the new locale middleware's auth logic.
- 35 files under `apps/dashboard/src/app/dashboard` + `apps/dashboard/src/components` import `next/link`; 14 import hooks from `next/navigation` (`useRouter`/`usePathname`/`redirect`). These need to become locale-aware or an Arabic user gets bounced to the English URL on any internal navigation/redirect — this is a functional-correctness requirement, not a nice-to-have.
- Tailwind dark/light theming, semantic color tokens, and border-radius/shadow tokens are already solid (confirmed in Phase 1) — untouched by this phase except adding logical-property utilities for RTL and one new font.

## Goals

1. `/dashboard/**` and `/ar/dashboard/**` both work, fully, including every internal link and programmatic redirect within the dashboard.
2. `dir="rtl"` applies correctly for Arabic, `dir="ltr"` for English, at the `<html>` level (no FOUC, no hydration mismatch).
3. Marketing/auth URLs (`/about`, `/login`, etc.) are byte-for-byte unchanged — this is a structural relocation (route group), not a URL change.
4. A working language switcher exists somewhere reachable in the dashboard chrom (topbar) that round-trips correctly (switching preserves the current page, just swaps locale).
5. Message catalog infrastructure exists and covers navigation labels + shell chrome (sidebar, topbar) — full page-content translation is explicitly NOT this phase's job (matches Phase 1's "skeleton not full content" precedent).

## Non-goals

- Translating marketing/auth page content or moving them under `[locale]` — they stay English-only, structurally relocated only.
- Translating individual dashboard page body content (call lists, form labels deep inside pages, etc.) beyond the shell chrome and nav.
- Arabic voice/TTS (that's the Voice Agents phase, unrelated to this UI-layer work).
- SEO metadata localization for marketing pages (moot — marketing isn't localized this phase).

## Design

### A. Package and core config

- Add `next-intl` (^3.x) to `apps/dashboard/package.json`.
- `apps/dashboard/src/i18n/routing.ts` — defines `locales: ['en', 'ar']`, `defaultLocale: 'en'`, `localePrefix: 'as-needed'` (English stays unprefixed at `/dashboard`, Arabic gets `/ar/dashboard` — zero breakage for existing English bookmarks/links).
- `apps/dashboard/src/i18n/navigation.ts` — `createNavigation(routing)` exporting `{Link, redirect, usePathname, useRouter, getPathname}`. Every dashboard file that currently imports `Link` from `next/link` or hooks from `next/navigation` switches to import from this module instead — same call signatures, so it's a mechanical import swap, not a logic rewrite.
- `apps/dashboard/src/i18n/request.ts` — `getRequestConfig` loading the right message JSON file per locale for server components.
- `middleware.ts` at `apps/dashboard/` root — next-intl's middleware, scoped via `matcher` to only intercept `/`, `/dashboard/:path*`, and their `/ar/...` equivalents. Marketing/auth paths are explicitly excluded from the matcher so they're never touched by locale rewriting.

### B. Route restructuring

- **Dashboard**: `app/dashboard/**` (30 page files + 8 supporting files) moves to `app/[locale]/dashboard/**` via `git mv`, content unchanged.
- **New root layout**: `app/[locale]/layout.tsx` — the new root layout for everything under `[locale]`. Contains `<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>`, the `NextIntlClientProvider`, and the same `Providers`/font-loading/theme-init-script content currently in the top-level `app/layout.tsx`.
- **Marketing/auth relocation**: the ~26 top-level route folders (`about`, `ai-vs-human`, `alternatives`, `auth`, `blog`, `contact`, `docs`, `faq`, `features`, `forgot-password`, `forwarding`, `how-it-works`, `industries`, `integrations`, `login`, `onboarding`, `pricing`, `privacy`, `roi`, `security`, `signup`, `solutions`, `support`, `terms`, `vs-ruby`, `vs-smith`) move via `git mv` into the existing `app/(marketing)/` route group (URL-neutral — `/about` stays `/about`). The dead passthrough `(marketing)/layout.tsx` is promoted to a real root layout with the SAME content the new `[locale]/layout.tsx` gets (html lang="en" hardcoded, no locale switching — marketing stays English-only), satisfying Next.js's "multiple root layouts" requirement (no shared top-level `app/layout.tsx` above two independently-rooted trees).
- The original top-level `app/layout.tsx` is deleted (its content is now split between the two new root layouts).
- `app/api/**` and `app/global-error.tsx` / `app/not-found.tsx` stay where they are — API routes don't need a root layout, and Next.js's special files at the true top level continue to apply as fallbacks.

### C. Locale-aware navigation (the correctness-critical part)

- All 35 `next/link` imports and 14 `next/navigation` hook imports within `apps/dashboard/src/app/dashboard/**` and `apps/dashboard/src/components/**` (the ones used by dashboard pages) are swapped to import from `@/i18n/navigation` instead. Mechanical, file-by-file, verified by `npm run typecheck` (a missed import would surface as a type error only if the API shapes differ meaningfully — they don't, `next-intl`'s navigation exports are designed as drop-in replacements).
- `apps/dashboard/src/lib/dashboard-nav.ts` itself doesn't need locale-prefixed hrefs — it stays relative (`/dashboard/calls` etc.), because the `Link`/`useRouter` from `@/i18n/navigation` automatically prefix based on current locale context. This is why the navigation-import swap matters more than editing the nav config.

### D. RTL layout and Arabic font

- Tailwind: no new color/spacing tokens needed (Phase 1 confirmed the token system is solid). Add `IBM Plex Sans Arabic` via `next/font/google` in `[locale]/layout.tsx`, applied as a `font-arabic` class on `<body>` when `locale === 'ar'`, layered with the existing Inter (`font-sans` stays default for Latin text within Arabic pages — numbers, brand name, etc.).
- Existing dashboard components use physical Tailwind spacing (`pl-`, `pr-`, `ml-`, `mr-`) throughout — a full logical-property migration (`ps-`, `pe-`, `ms-`, `me-`) across every component is out of scope for this phase (that's real, wide-reaching visual-regression risk across 30+ pages). Instead: `dir="rtl"` on `<html>` combined with Tailwind's `rtl:` variant (already available in Tailwind 3.4+ without config changes) lets browser-native RTL flow handle most of it correctly for free (flexbox/grid naturally mirror), and any specific visual breakage found during manual QA gets targeted `rtl:` overrides rather than a wholesale rewrite.

### E. Message catalogs

- `apps/dashboard/src/messages/en.json` and `ar.json` — seeded with: every `dashboard-nav.ts` label + subtitle (nav labels move from hardcoded English strings in `dashboard-nav.ts` to translation keys, `dashboard-nav.ts` returns keys, components call `useTranslations()` to resolve), plus common shell strings (loading, error, retry, empty-state generic copy already used by `EmptyState`/`DashboardPage`). Deep page-body content stays hardcoded English for this phase — each page migrating its own content to translation keys is follow-up work, page by page, not blocked by this phase's infrastructure.

### F. Language switcher

- New component `apps/dashboard/src/components/dashboard/LanguageSwitcher.tsx`, placed in the dashboard topbar (`DashboardTopbar`). Uses `usePathname`/`useRouter` from `@/i18n/navigation` to switch locale while staying on the same page (`router.replace(pathname, {locale: nextLocale})` — next-intl's navigation `useRouter` supports a locale override option for exactly this).

## Testing

- Existing Playwright suites continue passing (can't verify live this session — same missing-credentials constraint as Phase 1).
- `npm run typecheck` / `npm run lint` are the primary automated gates, same as Phase 1 (no React component unit-test harness in this repo).
- Manual verification checklist (documented, executed when credentials are available): `/dashboard` still resolves in English with no visible change; `/ar/dashboard` resolves with `dir="rtl"` and Arabic nav labels; clicking every sidebar item from `/ar/dashboard` stays under `/ar/...`; the language switcher round-trips from any dashboard page.

## Migration / breaking changes

- No database changes.
- No API route changes.
- Marketing/auth URLs unchanged (route-group relocation is URL-neutral by Next.js design).
- Dashboard URLs unchanged for English (`localePrefix: 'as-needed'`); `/ar/dashboard/**` is new.
- Breaking change to be aware of: any external link, bookmark, or hardcoded string elsewhere in the codebase (docs, marketing copy, integration configs) that assumes `app/dashboard/page.tsx` as a literal file path breaks — none found via search, but this is the one thing worth a final grep pass before merging.
