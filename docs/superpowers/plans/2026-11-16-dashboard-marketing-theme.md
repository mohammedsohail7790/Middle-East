# Dashboard Marketing Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the signed-in Halla dashboard look and read like the AI receptionist marketing site, in English and Arabic, light and dark.

**Architecture:** Swap the legacy gold/accent/ink CSS tokens in `globals.css` to the marketing palette, add display and body fonts, restyle the shared shell and ui-kit once, then sweep pages for hard-coded colours. Consultancy routes keep the old blue look through a scoped override. A separate promise pass compares dashboard copy and prices with the public site.

**Tech Stack:** Next.js 15 (App Router, next-intl), Tailwind, CSS variables in `apps/dashboard/src/app/globals.css` and `src/styles/apple-dashboard.css`, `next/font/google`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-dashboard-marketing-theme-design.md`

## Global Constraints

- Marketing palette (from `public/halla-gcc-theme.css`): paper `#FAF9F6`, ink `#121417`, gold `#C5A059`, gold text `#7A5A1E`, gold dark `#6B4F18`.
- Fonts: display Cormorant Garamond (titles and large numbers only), body Plus Jakarta Sans, Arabic Cairo (also replaces the display font for titles and large numbers in Arabic).
- Gold fills and borders use `#C5A059`; gold used as text on light uses `#7A5A1E`.
- Text contrast target WCAG AA (4.5:1 normal, 3:1 large) in light and dark.
- Dark mode stays (`.dark` class, `ThemeToggle`).
- Consultancy pages (`/dashboard/consultancy/*`) keep the old blue look.
- Status colours (green, red, orange) stay semantic and are not gold.
- No API, database or marketing-site changes. Phone fixes from PRs #142 to #145 must not regress (375px width, no sideways scroll, 44px tap targets).
- Several PRs, owner merges. Never deploy or edit Billing prices without the owner's decision.
- Work on branches off `origin/main`; commit with the owner's git identity once they provide it.

## Review Focus

1. Arabic titles and numbers: Cormorant has no Arabic glyphs, so Arabic must fall back to Cairo and RTL layouts must not break (checked on every page).
2. Gold text on the dark background and gold-filled buttons: contrast and visible focus rings in both themes.
3. Consultancy leakage: consultancy pages must not pick up gold, and receptionist pages must not keep blue.
4. Large numbers in serif on stat cards at 375px: no overflow or wrapping mid-number.
5. Hard-coded hex colours and Tailwind blue classes left in pages that ignore the tokens.

---

### Task 1: Palette tokens and contrast test

**Files:**
- Modify: `apps/dashboard/src/app/globals.css` (`:root` block ~lines 12-132, `.dark` block ~134-190)
- Modify: `apps/dashboard/src/styles/apple-dashboard.css` (`:root` and `.dark` surface variables, lines ~15-28)
- Create: `apps/dashboard/src/lib/theme-tokens.test.ts`

**Interfaces:**
- Produces: tokens `--gold`, `--gold-text`, `--gold-dark`, `--accent`, `--background`, `--foreground`, `--card`, `--border`, `--surface-card`, `--hairline` now hold marketing values in light and dark; the test exports nothing.

- [ ] **Step 1: Write the failing test.** `theme-tokens.test.ts` reads `globals.css`, extracts `:root` and `.dark` custom properties, and asserts: `:root --background` resolves to `#FAF9F6`, `--foreground` to `#121417`, `--gold` to `#C5A059`, `--gold-text` to `#7A5A1E`; contrast of foreground on background, gold-text on background, foreground on card, and ink on gold fill is at least 4.5 in light; the same pairs with the `.dark` values at least 4.5 (gold-text in dark resolves to a lighter gold such as `#D9B877`). Include a small hex-to-luminance helper inside the test file.
- [ ] **Step 2: Run** `cd apps/dashboard && npx vitest run src/lib/theme-tokens.test.ts` — expect FAIL (tokens still Apple blue).
- [ ] **Step 3: Implement.** In `:root` set the gold family, accent, `--background` (paper), `--foreground` (ink), `--card`, gray scale warmed to match paper, `--border` hairline, `--primary` gold with ink foreground, `--ring` gold, `--gradient-brand` gold. In `.dark` set a warm near-black background (`#121417`), paper-coloured text, gold `#C5A059` fill, `--gold-text` a lighter gold that passes 4.5. Update the surface variables in `apple-dashboard.css` to warm equivalents. Keep semantic green/red/orange.
- [ ] **Step 4: Run** the test again — expect PASS. Run `npm run lint && npx tsc --noEmit` from `apps/dashboard`.
- [ ] **Step 5: Commit** `feat(dashboard): marketing palette tokens, light and dark`.

### Task 2: Fonts

**Files:**
- Modify: `apps/dashboard/src/app/[locale]/layout.tsx` (font setup lines ~2-14, className line ~55)
- Modify: `apps/dashboard/tailwind.config.js` (`fontFamily`, lines ~86-90)
- Modify: `apps/dashboard/src/app/globals.css` (`--font-sans`, new `.font-display` rule)

**Interfaces:**
- Produces: CSS variables `--font-display`, `--font-body`, `--font-cairo`; Tailwind class `font-display`; in `html[lang="ar"]` `font-display` resolves to Cairo.

- [ ] **Step 1: Failing test** in `theme-tokens.test.ts`: `globals.css` defines `.font-display` using Cormorant, and an `[lang="ar"]` rule mapping `.font-display` to Cairo. Run, expect FAIL.
- [ ] **Step 2: Implement** `next/font/google` loaders for Cormorant_Garamond (weights 500-700, latin), Plus_Jakarta_Sans, Cairo (arabic, latin); expose as variables on the root element; set body sans to Plus Jakarta (English) and Cairo (Arabic); keep Inter loaded only if still referenced elsewhere.
- [ ] **Step 3: Run** the test, lint, typecheck, then `npm run build` once to confirm fonts compile. Expect PASS.
- [ ] **Step 4: Commit** `feat(dashboard): marketing fonts with Arabic fallback`.

### Task 3: Consultancy scope

**Files:**
- Modify: `apps/dashboard/src/lib/dashboard-nav.ts` (add helper)
- Modify: `apps/dashboard/src/components/dashboard-shell/app-shell.tsx` (wrapper at the `dashboard-app` div, line ~154)
- Modify: `apps/dashboard/src/app/globals.css` (add `[data-brand="consultancy"]` block restoring the previous blue token values)
- Test: `apps/dashboard/src/lib/dashboard-nav.test.ts`

**Interfaces:**
- Produces: `isConsultancyPath(pathname: string): boolean` — true for `/dashboard/consultancy` and any sub-path, with or without a locale prefix (`/en/dashboard/consultancy/leads`, `/ar/dashboard/consultancy`), false for `/dashboard/consultations` and other look-alikes.

- [ ] **Step 1: Failing tests** for the helper: the true cases above and the look-alike false case. Run, expect FAIL.
- [ ] **Step 2: Implement** the helper; in `app-shell.tsx` set `data-brand="consultancy"` on the wrapper when `isConsultancyPath(usePathname())`; copy the old Apple blue light and dark values into the scoped CSS block.
- [ ] **Step 3: Run** tests, lint, typecheck. Expect PASS.
- [ ] **Step 4: Commit** `feat(dashboard): scope consultancy to its own token set`.

### Task 4: Shell and shared components restyle

**Files:**
- Modify: `apps/dashboard/src/styles/apple-dashboard.css` (shell, buttons, cards, inputs, tabs, tables, badges, toasts)
- Modify: `apps/dashboard/src/components/dashboard-shell/app-shell.tsx`, `MobileBottomNav.tsx`
- Modify: `apps/dashboard/src/components/dashboard/DashboardTopbar.tsx`
- Modify: `apps/dashboard/src/components/ui-kit/PageHeader.tsx`, `StatCard.tsx`, `EmptyState.tsx`, `DashboardTabs.tsx`, `IconBox.tsx`

**Interfaces:**
- Consumes: tokens and `font-display` from Tasks 1-2.
- Produces: buttons gold fill with ink text and ink-on-hover border style like `.btn` in `halla-gcc-theme.css`; page titles and stat numbers use `font-display`; body and tables stay sans.

- [ ] **Step 1: Implement** the restyle with class changes and CSS only; keep tap targets at 44px and the `block sm:table` patterns from the phone fixes. Use `font-display` on `PageHeader` title and `StatCard` value only; add `tabular-nums` and `break-words` guards so large numbers do not overflow at 375px.
- [ ] **Step 2: Verify visually** with the browser pane (preview server for `apps/dashboard`) at 375px and 1280px, English and Arabic, light and dark, on the Overview page: sidebar, topbar, stat cards, buttons, inputs, focus ring visible. Expect no sideways scroll and no blue left outside consultancy.
- [ ] **Step 3: Run** `npm run lint && npx tsc --noEmit && npx vitest run`. Expect PASS.
- [ ] **Step 4: Commit** `feat(dashboard): marketing look for shell and shared components`. Open PR for Round 1 together with Task 5.

### Task 5: Round 1 pages — Overview, Calls, call detail

**Files:**
- Modify: `apps/dashboard/src/app/[locale]/dashboard/page.tsx`, `calls/page.tsx`, `calls/[id]/page.tsx`
- Modify: components under `src/components/dashboard/` and `src/components/calls/` that hard-code colours

**Interfaces:**
- Consumes: Task 4 components.

- [ ] **Step 1: Find hard-coded colours** with `grep -rnE "#[0-9a-fA-F]{6}|blue-[0-9]{3}|sky-[0-9]{3}" <files>` and replace with token classes (`text-accent`, `bg-card`, `border-border`) except semantic status colours.
- [ ] **Step 2: Verify** each page in the browser pane at 375px and 1280px, English and Arabic, light and dark. Expect: no overflow, titles in display font, status chips readable.
- [ ] **Step 3: Run** lint, typecheck, vitest. Expect PASS.
- [ ] **Step 4: Commit** `feat(dashboard): marketing look for overview and calls`; push; owner opens/merges PR; check live after Vercel deploy.

### Task 6: Round 2 pages

**Files:**
- Modify pages under `apps/dashboard/src/app/[locale]/dashboard/`: `leads`, `calendar`, `phone-numbers`, `business-profile`, `agent`, `agents`, `knowledge`, plus their components (`src/components/knowledge/`, `agent/`, `business-profile/`).

- [ ] **Step 1:** Per page, same token sweep and verification as Task 5 (375px, 1280px, EN/AR, light/dark).
- [ ] **Step 2: Run** lint, typecheck, vitest. Expect PASS.
- [ ] **Step 3: Commit** per area, e.g. `feat(dashboard): marketing look for leads and calendar`; PR for Round 2.

### Task 7: Round 3 pages

**Files:**
- Modify pages: `analytics`, `quality`, `outbound`, `automations` (+ `activity`), `integrations` (+ `setup`), `whatsapp`, `billing`, `team`, `settings` (+ `spam`), `compliance` (+ `center`), `crm/*`, `support`; components in `src/components/{automations,integrations,billing,settings,outbound,whatsapp,support}/`.

- [ ] **Step 1:** Same sweep and verification. Billing: restyle only; do not change plan names or prices here.
- [ ] **Step 2: Verify consultancy** pages still render with the old blue look (all five routes) and without errors.
- [ ] **Step 3: Run** lint, typecheck, vitest. Expect PASS.
- [ ] **Step 4: Commit** per area; PR for Round 3.

### Task 8: Claims audit and price mismatch list (report only)

**Files:**
- Create: `docs/superpowers/reports/2026-11-16-dashboard-vs-marketing-claims.md`

- [ ] **Step 1:** List each receptionist claim on the marketing site (24/7 answering, appointment booking, lead capture, emergency routing, 15-minute setup, plan names, prices, limits). For each, record where the dashboard shows it (file and component), where the data comes from, and whether it is shown, missing, or untrue.
- [ ] **Step 2:** List every plan name, price and limit mismatch between `dashboard-nav.ts`, the Billing page, `store-plans.ts`, and the marketing content in `src/lib/marketing-*.ts`.
- [ ] **Step 3:** Commit the report and hand it to the owner. Stop; do not edit Billing or add new claims.

### Task 9: Promise pass edits (after owner and Hk decide)

**Files:** decided by the Task 8 report; expected: `billing/page.tsx`, `src/lib/dashboard-nav.ts`, `src/lib/store-plans.ts`, message files for en/ar, Overview components.

- [ ] **Step 1:** With the owner's decision on the correct price list, update the plan names, prices and limits in one source and make Billing and nav read it; add tests in `store-plans.test.ts` pinning each plan's name and price to the decided values.
- [ ] **Step 2:** Show only claims that have data behind them; anything else stays on the gap list.
- [ ] **Step 3: Run** lint, typecheck, vitest; verify in the browser pane in English and Arabic. Commit and open PR.

### Task 10: Final verification

- [ ] **Step 1:** After each PR is deployed, sweep every page live (375px and desktop, EN/AR, light/dark) and list anything off.
- [ ] **Step 2:** Update the project memory note with the state and any open items.
