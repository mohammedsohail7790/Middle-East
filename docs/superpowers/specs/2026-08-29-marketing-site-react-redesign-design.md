# Marketing site: React redesign (no 3D, design-system driven)

## Context

The marketing site (Halla AI consultancy + AI Receptionist product pages) is
currently a hand-built vanilla HTML/CSS/JS SPA (`halla_main.js`,
`halla_styles.css`, `index.html`, mounted via `MarketingSPA.tsx` in the
dashboard app). Two prior sessions added 3D hero visualizations (a
`@react-three/fiber` path that never worked due to a pre-existing React 18
incompatibility, and a vanilla Three.js fallback that did). The user does not
like the resulting UI/UX and wants the 3D removed and the entire marketing
site rebuilt as proper React components using the dashboard app's existing
Radix UI / shadcn-style component conventions — "professionally polished,"
explicitly "not vibe coded."

## Scope

Full rebuild of the marketing site into Next.js App Router pages inside
`apps/dashboard`, replacing the vanilla SPA entirely. Decomposed into three
sub-projects, each independently plannable and implementable, all following
one shared design system built in sub-project 1:

1. Design system + both hero sections
2. Rest of the Consultancy page
3. Rest of the AI Receptionist product site (largest — industries, pricing,
   features, blog, comparisons, solutions, FAQ)

Implementation proceeds in phases with review checkpoints between them,
starting with (1). The vanilla SPA continues serving any page not yet
migrated until its sub-project lands.

## Architecture

- New pages live under `apps/dashboard/src/app/(marketing)/`, in the
  existing `(marketing)` route group (which already has the
  `error.tsx` boundary and layout scaffolding).
- Two themed route trees: `/[locale]/consultancy/*` (dark) and `/[locale]/*`
  (the Receptionist product site, light) — kept visually distinct since
  they are different products, not merged into one identity.
- Shared layout lives once: `components/marketing/layout/SiteHeader.tsx`,
  `SiteFooter.tsx`, `MobileNav.tsx`, themed via a `data-brand="consultancy" |
  "receptionist"` attribute rather than duplicated per-brand markup.
- Content is extracted from hardcoded HTML into typed data files under
  `content/` (e.g. `content/industries.ts`, `content/pricing.ts`,
  `content/capabilities.ts`) — pages become components rendering data.
- i18n continues via `next-intl` (already used elsewhere in the app); no
  change to the `en`/`ar` routing scheme.
- Once a route's React version ships, its equivalent path is removed from
  the vanilla SPA's page set (or the SPA's router simply stops being reached
  for that path — exact mechanics are an implementation-phase decision, not
  a design-phase one).

## Design system

**Tokens.** Extend the existing CSS-variable pattern (`--background`,
`--foreground`, `--primary`, etc., already defined for the dashboard app)
with brand-specific values selected by the `data-brand` attribute:

- `consultancy`: near-black background, purple `#7C3AED` primary, red
  `#EF4444` secondary accent (matches current site).
- `receptionist`: white background, teal `#0D9488` primary (matches current
  site).

One shared type scale and font stack across both brands — the "not
vibe-coded" bar is about restraint and consistent rhythm, not different
typography per brand.

**New `ui/` primitives** (shadcn pattern: Radix + CVA + Tailwind, matching
the 6 that already exist — `button`, `badge`, `input`, `label`,
`dropdown-menu`, `skeleton`). All have Radix packages already installed;
only the styled wrapper is new:

`card`, `tabs`, `accordion`, `dialog`, `separator`, `tooltip`, `select`,
`switch`, `avatar`, `progress`.

**Marketing-specific components**, built on the primitives above, one clear
purpose each, living in `components/marketing/`:

`HeroSection`, `PricingTable`, `FeatureGrid`, `IndustryCard`, `FaqAccordion`,
`TestimonialCard`, `StatBar`, `CtaBanner`, `StepList`, `Marquee` (reuse the
existing magic-ui `Marquee` component already in the codebase),
`ComparisonTemplate`, `IndustryPageTemplate`, `BlogPostTemplate`,
`RoiCalculator`.

**Motion.** framer-motion for section-reveal-on-scroll and hover states
only — standard fade/slide-up transitions, no canvas, no 3D, nothing with
its own render loop.

## Sub-project 1: Design system + both hero sections

Build the token extensions and the `ui/` primitives listed above, then:

- **Consultancy hero** (`/[locale]/consultancy`): eyebrow badge → headline
  ("We Don't Sell AI. We Install It.") → subcopy → primary/secondary CTA,
  left-aligned on black with a static radial purple→black gradient wash (no
  canvas). Right side: the outcome stats ("hours/week reclaimed" /
  "connected systems" / "responder wins the lead") as a `StatBar` of clean
  stacked cards, not floating over a 3D panel. No image, no illustration.
- **AI Receptionist hero** (`/[locale]`): centered layout matching the
  current convention for this page — eyebrow → headline → subcopy → CTA row
  → trust checkmarks → stats bar, light background, teal accent, subtle
  static gradient wash instead of the waveform canvas.
- Fully responsive via Tailwind utilities, no hand-written `@media` rules.
- `prefers-reduced-motion` is moot beyond standard fade-ins, since there is
  no continuous animation left to reduce.

## Sub-project 2: Rest of the Consultancy page

Migrate section-by-section, each backed by a design-system primitive —
no page-specific one-off styling:

- Capability marquee → `Marquee` + `content/capabilities.ts` (also
  incidentally fixes the CSS-overflow bug found in the vanilla version,
  since a proper component won't reproduce it).
- Service cards (Process Mapping / Workflow Automation / etc.) →
  `FeatureGrid` of `Card`s, icons from `lucide-react` (already a
  dependency).
- "How We Work" steps → `StepList`.
- CTA blocks ("Book a Diagnostic Call") → `CtaBanner`, reused everywhere
  the pattern repeats.
- Footer → `SiteFooter brand="consultancy"`, sharing structure with the
  Receptionist footer via the shared layout component, differing only in
  link content.

## Sub-project 3: Rest of the AI Receptionist product site (largest)

Templating, not duplication, is the core requirement — the 27 industry
pages must not become 27 hand-written components:

- **Industries**: one `IndustryPageTemplate` + `content/industries.ts`
  (`{slug, name, painPoints, features, testimonial}[]`), rendered via a
  dynamic route `[industry]/page.tsx`. Same template drives the industries
  index grid.
- **Pricing**: `PricingTable` fed by `content/pricing.ts`, plus
  `RoiCalculator` as the one genuinely interactive client component on this
  page.
- **Features**: `FeatureGrid`, reused from sub-project 2, different
  content.
- **Comparison pages** (e.g. "AI vs. Human Receptionist"): one
  `ComparisonTemplate` + one content file per comparison — same templating
  principle as industries.
- **Blog**: article list + `BlogPostTemplate`; content from MDX or a simple
  content array (matches current scope — no CMS integration implied).
- **FAQ**: `FaqAccordion` fed by a content array.
- **Solutions sub-pages**: same templating pattern as industries.

By this phase, essentially all new work should be content + composition —
close to zero new one-off component code, since every section reuses a
primitive from sub-project 1/2.

## Testing

- Each sub-project's pages get Playwright smoke coverage (page loads,
  primary CTA visible and clickable, no console errors) added to the
  existing `e2e/` suite, following existing test conventions.
- No horizontal-overflow / mobile-breakpoint regressions — verify on the
  same viewport matrix already used in this session (390px mobile, iPad
  Mini portrait/landscape, iPad Pro landscape) before each phase is
  considered done.

## Out of scope

- Any 3D visualization, canvas-based visual, or `@react-three/fiber` usage
  in these pages — explicitly removed, not replaced with another 3D
  treatment.
- CMS integration for the blog (unless requested later).
- Redesigning the dashboard app itself (only the public marketing pages are
  in scope).
- Fixing the pre-existing `@react-three/fiber` v8/React 18 incompatibility
  discovered earlier this session — moot once the 3D scenes are removed.
