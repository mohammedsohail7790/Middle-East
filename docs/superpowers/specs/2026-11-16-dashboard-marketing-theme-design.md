# Halla dashboard: match the marketing site (AI receptionist)

Date: 16 Nov 2026. Status: draft for approval. Nothing built.

## Intent and why

A client who signs up from the AI receptionist marketing page should land in a dashboard that looks like the same company and says the same things. Today it does not: the marketing site is editorial (warm paper, ink, gold, serif headings, Arabic and English), while the dashboard is an Apple-style blue system. Billing also shows prices and plan names that differ from the public site (for example "$149 Professional" against AED 550). Hk's recent complaint was alignment on phones, and the owner wants the whole product to feel finished.

Decision from the owner: do both the look and the promises, look first.

## Goals

1. Every receptionist dashboard page uses the marketing look: colours, type, spacing, buttons, cards, tables, badges, in English and Arabic/RTL, light and dark.
2. Dashboard content and numbers match what marketing promises for the receptionist: plan names, prices and limits, 24/7 answering, booking, lead capture, emergency routing, 15-minute setup.
3. No regression on phones (the alignment fixes from PRs #142 to #145 stay) and no loss of function.

## Non-goals

- The consultancy pages (`/dashboard/consultancy/*`) keep their own look, since consultancy is a separate brand. They must still render correctly after token changes.
- No new features, no API or database changes, no changes to the marketing site itself.
- No rewrite of pages into the marketing site's plain HTML `cx-` components.

## Anti-goals

- A dashboard that looks like marketing but is harder to use (dense tables turned into airy editorial blocks, low-contrast gold text).
- Breaking dark mode, RTL, or the mobile layouts.
- Marketing claims shown in the dashboard that the product cannot do yet.

## Constraints

- The dashboard styles come from CSS variables in `apps/dashboard/src/app/globals.css` plus `src/styles/apple-dashboard.css`, Tailwind tokens in `tailwind.config.js`, shared components in `src/components/ui-kit` and `src/components/dashboard-shell/app-shell.tsx`.
- Legacy token names (`--gold`, `--cyan`, `--accent`, `--navy`) are aliases that currently resolve to Apple blue and ink. This is what makes a token-level retheme possible.
- Marketing values (from `public/halla-gcc-theme.css`): paper `#FAF9F6`, ink `#121417`, gold `#C5A059`, gold text `#7A5A1E`, gold dark `#6B4F18`, display font Cormorant Garamond, body Plus Jakarta Sans (Arabic: Cairo).
- The dashboard has a dark mode (`.dark` class, `ThemeToggle`).
- Deploys: Vercel on merge to main. Owner merges PRs. Several PRs, not one big one.
- Gold text on white is only readable with the darker `#7A5A1E`; the lighter `#C5A059` is for fills and borders.

## Approaches considered

- **A. Retheme through the tokens, then a page-by-page pass (chosen by the owner).** Swap the variables, restyle the shared components once, then fix pages that hard-code colours or layouts. Fastest and most consistent. Some pages need hand fixes.
- **B. Rebuild each page from the marketing components.** Closest match, but those components are plain HTML/CSS, not React. Roughly 36 page rewrites, high risk, would undo the phone fixes. Rejected.
- **C. Light skin only (accent colour and fonts).** Quick, but the dashboard would still feel like another product. Rejected.

## Design

**1. Tokens.** Point the legacy gold/accent/ink tokens at the marketing palette in light mode; define a matching dark set (warm near-black background, paper-coloured text, gold for accents with a lighter gold text variant). Load Cormorant Garamond and Plus Jakarta Sans for the dashboard (Cairo for Arabic) and apply the display font to page titles and large numbers only; body, tables and inputs stay in the sans font for legibility.

**2. Shared components.** Restyle once: sidebar and topbar, page header, stat card, cards, buttons (gold fill, ink text, the marketing hover), inputs, tabs, tables, badges and status chips, empty states, toasts, the mobile bottom nav. Keep sizes and tap targets from the phone fixes.

**3. Page pass, in this order.**
- Round 1: shared components, Overview, Calls (and call detail).
- Round 2: Leads, Calendar, Phone numbers, Business profile, Agent, Knowledge.
- Round 3: Analytics, Quality, Outbound, Automations, Integrations, WhatsApp, Billing, Team, Settings, Compliance, CRM, Support.
- Consultancy pages: check only that nothing breaks.
Each page is checked on phone width, desktop, Arabic/RTL and dark mode.

**4. Promise pass (after the look, same order of priority).**
- Billing and plans: read the plan names, prices and limits from one source and make them match the public pricing (AED). Where the dashboard and marketing disagree, the owner and Hk decide which is right before anything changes.
- Overview and onboarding: show the marketing claims as real product states (always answering, bookings made, leads captured, emergency routing on/off, setup progress), using data that already exists. If a claim has no data behind it, do not show it; list it as a gap instead.

**5. Verification.** Typecheck and lint for the dashboard, unit tests where they exist, then visual checks in the browser pane at phone and desktop widths, in English and Arabic and in both themes, before each PR is offered for merge. Live check after each Vercel deploy.

## Left to the builder

- Exact dark palette values and font loading method (next/font vs CSS), within the constraints above.
- How to split the PRs inside each round.
- Which hard-coded colours are replaced by tokens and which are left (status colours such as green and red stay semantic).
- The selector strategy for any consultancy-brand scoping.

## Open items needing the owner or Hk

- Which price list is correct for the receptionist plans (dashboard or public site), before the promise pass edits Billing.
- Whether dark mode should stay. Assumption in this design: it stays.

## Calls made after the builder check (marked as my calls)

- **Brand scoping (my call).** Consultancy is told apart by route prefix `/dashboard/consultancy/*`. The retheme is a global token swap with a consultancy override scoped on a wrapper at that prefix, so Round 1 can ship without changing consultancy. Login, signup and onboarding (outside `/dashboard`) are not in this work; they are a follow-up.
- **Page list (my call).** The scope is every page listed in `src/lib/dashboard-nav.ts` plus call detail, integrations setup, compliance centre and spam settings. Billing, Team, Settings and Compliance are treated as shared and get the new look in Round 3.
- **Plan source (my call).** Plan names live in `dashboard-nav.ts` (`Starter`, `Professional`) and prices on the Billing page in code. The public pricing lives in marketing content in the same repo. The promise pass reads both and lists every mismatch for the owner and Hk before any edit. Look rounds do not wait on this; Billing prices go last. No backend change is planned; if prices turn out to come from the backend or Stripe, that is reported rather than changed.
- **Claims audit (my call).** The builder produces a short gap list (claim, data source, shown or not) as part of Round 1 recon. The owner signs it off.
- **Contrast (my call).** Target WCAG AA for text in both themes.
- **Testing (my call).** There are vitest unit tests but no screenshot tests. Verification stays as manual browser sweeps with the browser pane; no new test framework.
- **Arabic (my call).** Cairo replaces the display font for titles and large numbers in Arabic. Numerals follow whatever the dashboard shows today.
