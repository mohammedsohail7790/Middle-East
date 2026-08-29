# Rest of the Consultancy Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build out the rest of the Consultancy page (everything below the hero from sub-project 1) as React components — capability marquee, "why it matters" intro, three service cards, four-step "How We Work" timeline, comparison table, closing CTA, and shared footer — composed into the full page at `/design-preview/consultancy`, replacing the hero-only stub.

**Architecture:** Content (copy, list items, table rows) is extracted into one typed data file (`content/consultancy.ts`) so every component below is presentational, receiving data as props rather than hardcoding copy. Each section is its own small component in `components/marketing/`, built on the `Card`/`Separator` primitives and `HeroSection`/`StatBar` components from sub-project 1 (commit range `67086ae..3e40184`). The existing `Marquee` component (`@/components/magic-ui/marquee`, already in the codebase, not part of sub-project 1) is reused directly for the capability marquee rather than rebuilt. The `SiteFooter` component is built brand-aware (`brand: "consultancy" | "receptionist"`) now, even though only the consultancy variant is exercised in this sub-project, so sub-project 3 can reuse it without rework — this mirrors the shared-layout decision already made in the spec.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, the `Card`/`Separator` primitives and `HeroSection`/`StatBar` components from sub-project 1, `lucide-react` icons, Vitest + Testing Library (component tests, harness from sub-project 1 Task 2), Playwright (e2e).

## Global Constraints

- No `@react-three/fiber`, `@react-three/drei`, `three`, or any canvas/WebGL code in any file this plan creates.
- Follow the existing shadcn pattern for any new `ui/` primitive; marketing components are plain function components per sub-project 1's `HeroSection`/`StatBar` precedent (no `forwardRef` needed unless a ref is actually consumed).
- Brand tokens (from sub-project 1, `apps/dashboard/src/app/globals.css`): consultancy = `--background: #0a0708`, `--foreground: #f8fafc`, `--primary: #7c3aed`, `--accent: #ef4444`, `--card: #120f14`, `--border: rgba(255,255,255,0.12)`, `--muted: rgba(255,255,255,0.08)`. Use Tailwind utility classes (`bg-background`, `text-foreground`, etc.), never hardcoded hex values, so the same components work correctly once reused on the receptionist page in sub-project 3.
- No hand-written `@media` breakpoints — Tailwind responsive utilities only.
- Icons: use `lucide-react` (already a dependency), not the legacy `ti ti-*` tabler icon font classes used by the vanilla site.
- Every new component gets a Vitest component test. The composed page gets Playwright coverage.
- Run `cd apps/dashboard && npx tsc --noEmit`, `npx eslint <changed files> --max-warnings=0`, and `npx vitest run <changed test files>` after every task; all three must pass before moving to the next task.

---

### Task 1: Consultancy page content data

**Files:**
- Create: `apps/dashboard/src/content/consultancy.ts`

**Interfaces:**
- Produces the typed content every later component consumes:
  ```ts
  export type Capability = string;
  export const CAPABILITIES: Capability[];

  export type ServiceItem = {
    label: string; // e.g. "Efficiency"
    icon: "settings" | "trending-up" | "sparkles";
    title: string;
    description: string;
    bullets: string[];
    href: string;
    featured?: boolean;
    featuredBadge?: string;
  };
  export const SERVICES: ServiceItem[];

  export type TimelineStep = { number: string; title: string; description: string };
  export const HOW_WE_WORK_STEPS: TimelineStep[];

  export type ComparisonRow = {
    need: string;
    hallaAi: string;
    diy: string;
    agency: string;
    agencyNegative?: boolean; // true when the agency cell should read as a downside
  };
  export const COMPARISON_ROWS: ComparisonRow[];
  ```

- [ ] **Step 1: Write the content file**

```ts
// apps/dashboard/src/content/consultancy.ts
export type Capability = string;

export const CAPABILITIES: Capability[] = [
  "Process Mapping",
  "Workflow Automation",
  "Lead Engines",
  "CRM Integration",
  "AI Receptionist",
  "Brand Systems",
  "Review Automation",
  "Live Dashboards",
];

export type ServiceItem = {
  label: string;
  icon: "settings" | "trending-up" | "sparkles";
  title: string;
  description: string;
  bullets: string[];
  href: string;
  featured?: boolean;
  featuredBadge?: string;
};

export const SERVICES: ServiceItem[] = [
  {
    label: "Efficiency",
    icon: "settings",
    title: "Operations Automation",
    description:
      "We find the manual, repeatable work eating your team's time and hand it to AI — including your call handling with Halla AI.",
    bullets: [
      "Workflow & process automation",
      "Document & data handling",
      "AI receptionist & scheduling",
      "Internal reporting & dashboards",
    ],
    href: "/services/operations",
  },
  {
    label: "Revenue",
    icon: "trending-up",
    title: "Client Acquisition & Growth",
    description:
      "We build systems that find, qualify, and follow up with new customers — automatically, within seconds.",
    bullets: [
      "AI lead generation & qualification",
      "Instant lead follow-up systems",
      "Sales outreach automation",
      "CRM & pipeline integration",
    ],
    href: "/services/acquisition",
    featured: true,
    featuredBadge: "Most requested",
  },
  {
    label: "Visibility",
    icon: "sparkles",
    title: "AI-Powered Brand & Social",
    description:
      "We use AI to keep your business consistently visible, without it becoming another job on your plate.",
    bullets: [
      "AI-assisted content & posting",
      "Social media growth systems",
      "Review & reputation management",
      "On-brand messaging at scale",
    ],
    href: "/services/brand",
  },
];

export type TimelineStep = { number: string; title: string; description: string };

export const HOW_WE_WORK_STEPS: TimelineStep[] = [
  {
    number: "01",
    title: "Diagnostic call",
    description:
      "We trace where time and revenue leak — no jargon, no 40-slide deck. You leave with a clear priority list.",
  },
  {
    number: "02",
    title: "Map, then build",
    description:
      "Our AI engineer maps your actual operations and builds a working system in production — not a demo environment.",
  },
  {
    number: "03",
    title: "One owner, full team",
    description:
      "You work directly with one point of contact from scoping to delivery. A dedicated AI team builds behind the scenes.",
  },
  {
    number: "04",
    title: "Measure & tune",
    description:
      "Success is hours saved, leads generated, and revenue booked. If a system isn't delivering, we fix it or kill it.",
  },
];

export type ComparisonRow = {
  need: string;
  hallaAi: string;
  diy: string;
  agency: string;
  agencyNegative?: boolean;
};

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    need: "Connected systems, not one-off tools",
    hallaAi: "One layer across ops, sales & social",
    diy: "Disconnected apps, manual glue work",
    agency: "Often siloed by department",
  },
  {
    need: "Time to see it working",
    hallaAi: "Weeks, in production",
    diy: "Ongoing trial and error",
    agency: "Months of discovery phases",
  },
  {
    need: "Who you talk to",
    hallaAi: "One direct point of contact, backed by a full AI team",
    diy: "You, on top of everything else",
    agency: "Account manager, junior team",
  },
  {
    need: "Ongoing cost if it doesn't work",
    hallaAi: "No retainers for systems that don't deliver",
    diy: "Your time, indefinitely",
    agency: "Often locked into contracts",
    agencyNegative: true,
  },
];
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `cd apps/dashboard && npx eslint src/content/consultancy.ts --max-warnings=0`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/content/consultancy.ts
git commit -m "feat(marketing): add consultancy page content data"
```

---

### Task 2: `FeatureGrid` service cards component

**Files:**
- Create: `apps/dashboard/src/components/marketing/FeatureGrid.tsx`
- Test: `apps/dashboard/src/components/marketing/FeatureGrid.test.tsx`

**Interfaces:**
- Consumes: `Card`, `CardContent` from `@/components/ui/card` (sub-project 1); `Settings`, `TrendingUp`, `Sparkles`, `ArrowRight` icons from `lucide-react`; `type ServiceItem` from `@/content/consultancy` (Task 1); `cn` from `@/lib/utils`.
- Produces: `FeatureGrid({ items }: { items: ServiceItem[] })`. Later task (page composition) imports this and passes `SERVICES`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/FeatureGrid.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureGrid } from "./FeatureGrid";
import type { ServiceItem } from "@/content/consultancy";

const items: ServiceItem[] = [
  {
    label: "Efficiency",
    icon: "settings",
    title: "Operations Automation",
    description: "Test description.",
    bullets: ["Bullet one", "Bullet two"],
    href: "/services/operations",
  },
  {
    label: "Revenue",
    icon: "trending-up",
    title: "Client Acquisition & Growth",
    description: "Another description.",
    bullets: ["Bullet three"],
    href: "/services/acquisition",
    featured: true,
    featuredBadge: "Most requested",
  },
];

describe("FeatureGrid", () => {
  it("renders one card per service with title, bullets, and link", () => {
    render(<FeatureGrid items={items} />);
    expect(screen.getByText("Operations Automation")).toBeInTheDocument();
    expect(screen.getByText("Bullet one")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore Operations/i })).toHaveAttribute(
      "href",
      "/services/operations",
    );
  });

  it("shows the featured badge only on the featured item", () => {
    render(<FeatureGrid items={items} />);
    expect(screen.getByText("Most requested")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/FeatureGrid.test.tsx`
Expected: FAIL — `Cannot find module './FeatureGrid'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/FeatureGrid.tsx
import Link from "next/link";
import { ArrowRight, Settings, Sparkles, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ServiceItem } from "@/content/consultancy";

const ICONS = {
  settings: Settings,
  "trending-up": TrendingUp,
  sparkles: Sparkles,
} as const;

export function FeatureGrid({ items }: { items: ServiceItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <Card
            key={item.title}
            className={cn(
              "flex flex-col",
              item.featured && "border-primary/50 ring-1 ring-primary/30",
            )}
          >
            <CardContent className="flex flex-1 flex-col gap-4 p-6">
              {item.featured && item.featuredBadge && (
                <span className="w-fit rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                  {item.featuredBadge}
                </span>
              )}
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
                <Icon className="size-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                {item.label}
              </span>
              <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
              <p className="text-sm text-foreground-secondary">{item.description}</p>
              <ul className="flex flex-1 flex-col gap-2 text-sm text-foreground-secondary">
                {item.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2">
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={item.href}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Explore {item.title.split(" ")[0]} <ArrowRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/FeatureGrid.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/FeatureGrid.tsx src/components/marketing/FeatureGrid.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/FeatureGrid.tsx apps/dashboard/src/components/marketing/FeatureGrid.test.tsx
git commit -m "feat(marketing): add FeatureGrid service cards component"
```

---

### Task 3: `StepList` timeline component

**Files:**
- Create: `apps/dashboard/src/components/marketing/StepList.tsx`
- Test: `apps/dashboard/src/components/marketing/StepList.test.tsx`

**Interfaces:**
- Consumes: `type TimelineStep` from `@/content/consultancy` (Task 1).
- Produces: `StepList({ steps }: { steps: TimelineStep[] })`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/StepList.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepList } from "./StepList";

describe("StepList", () => {
  it("renders each step's number, title, and description", () => {
    render(
      <StepList
        steps={[
          { number: "01", title: "Diagnostic call", description: "We trace where time leaks." },
          { number: "02", title: "Map, then build", description: "We build a working system." },
        ]}
      />,
    );
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("Diagnostic call")).toBeInTheDocument();
    expect(screen.getByText("We build a working system.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/StepList.test.tsx`
Expected: FAIL — `Cannot find module './StepList'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/StepList.tsx
import type { TimelineStep } from "@/content/consultancy";

export function StepList({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step) => (
        <div key={step.number} className="flex flex-col gap-2">
          <span className="text-3xl font-bold text-primary/40">{step.number}</span>
          <h4 className="text-lg font-semibold text-foreground">{step.title}</h4>
          <p className="text-sm text-foreground-secondary">{step.description}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/StepList.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/StepList.tsx src/components/marketing/StepList.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/StepList.tsx apps/dashboard/src/components/marketing/StepList.test.tsx
git commit -m "feat(marketing): add StepList timeline component"
```

---

### Task 4: `ComparisonTable` component

**Files:**
- Create: `apps/dashboard/src/components/marketing/ComparisonTable.tsx`
- Test: `apps/dashboard/src/components/marketing/ComparisonTable.test.tsx`

**Interfaces:**
- Consumes: `type ComparisonRow` from `@/content/consultancy` (Task 1); `Check`, `X` icons from `lucide-react`; `cn` from `@/lib/utils`.
- Produces: `ComparisonTable({ rows, competitorLabel }: { rows: ComparisonRow[]; competitorLabel: string })`. `competitorLabel` names the "Halla AI" column's header so this table is reusable if a future page compares against a different product.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/ComparisonTable.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComparisonTable } from "./ComparisonTable";

describe("ComparisonTable", () => {
  it("renders each row's need and all three comparison cells", () => {
    render(
      <ComparisonTable
        competitorLabel="Halla AI Consultancy"
        rows={[
          {
            need: "Connected systems, not one-off tools",
            hallaAi: "One layer across ops, sales & social",
            diy: "Disconnected apps, manual glue work",
            agency: "Often siloed by department",
          },
        ]}
      />,
    );
    expect(screen.getByText("Connected systems, not one-off tools")).toBeInTheDocument();
    expect(screen.getByText("One layer across ops, sales & social")).toBeInTheDocument();
    expect(screen.getByText("Disconnected apps, manual glue work")).toBeInTheDocument();
    expect(screen.getByText("Often siloed by department")).toBeInTheDocument();
    expect(screen.getByText("Halla AI Consultancy")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/ComparisonTable.test.tsx`
Expected: FAIL — `Cannot find module './ComparisonTable'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/ComparisonTable.tsx
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ComparisonRow } from "@/content/consultancy";

export function ComparisonTable({
  rows,
  competitorLabel,
}: {
  rows: ComparisonRow[];
  competitorLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-4 font-semibold text-foreground-secondary">What you need</th>
            <th className="p-4 font-semibold text-primary">{competitorLabel}</th>
            <th className="p-4 font-semibold text-foreground-secondary">Doing it yourself</th>
            <th className="p-4 font-semibold text-foreground-secondary">Traditional agency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.need} className="border-b border-border last:border-0">
              <td className="p-4 font-medium text-foreground">{row.need}</td>
              <td className="p-4 text-foreground">
                <span className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {row.hallaAi}
                </span>
              </td>
              <td className="p-4 text-foreground-secondary">{row.diy}</td>
              <td className={cn("p-4 text-foreground-secondary", row.agencyNegative && "text-accent")}>
                {row.agency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/ComparisonTable.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/ComparisonTable.tsx src/components/marketing/ComparisonTable.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/ComparisonTable.tsx apps/dashboard/src/components/marketing/ComparisonTable.test.tsx
git commit -m "feat(marketing): add ComparisonTable component"
```

---

### Task 5: `CtaBanner` component

**Files:**
- Create: `apps/dashboard/src/components/marketing/CtaBanner.tsx`
- Test: `apps/dashboard/src/components/marketing/CtaBanner.test.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button`; `type HeroCta` from `@/components/marketing/HeroSection` (sub-project 1) — reuses the same CTA shape so callers don't learn a second type.
- Produces: `CtaBanner({ eyebrow, headline, subcopy, ctas }: { eyebrow: string; headline: string; subcopy: string; ctas: HeroCta[] })`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/CtaBanner.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CtaBanner } from "./CtaBanner";

describe("CtaBanner", () => {
  it("renders eyebrow, headline, subcopy, and CTA links", () => {
    render(
      <CtaBanner
        eyebrow="Ready When You Are"
        headline="Let's map out where AI can move the needle in your business"
        subcopy="Book a diagnostic call."
        ctas={[
          { label: "Book Your Diagnostic Call", href: "/consult-signup" },
          { label: "See the AI Receptionist", href: "/design-preview/receptionist", variant: "outline" },
        ]}
      />,
    );
    expect(screen.getByText("Ready When You Are")).toBeInTheDocument();
    expect(
      screen.getByText("Let's map out where AI can move the needle in your business"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book Your Diagnostic Call" })).toHaveAttribute(
      "href",
      "/consult-signup",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/CtaBanner.test.tsx`
Expected: FAIL — `Cannot find module './CtaBanner'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/CtaBanner.tsx
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { HeroCta } from "@/components/marketing/HeroSection";

export function CtaBanner({
  eyebrow,
  headline,
  subcopy,
  ctas,
}: {
  eyebrow: string;
  headline: string;
  subcopy: string;
  ctas: HeroCta[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center sm:px-12">
      <span className="inline-flex w-fit items-center rounded-full bg-primary/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        {eyebrow}
      </span>
      <h2 className="mx-auto mt-4 max-w-2xl text-2xl font-bold text-foreground sm:text-3xl">
        {headline}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-foreground-secondary">{subcopy}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {ctas.map((cta) => (
          <Button key={cta.label} asChild variant={cta.variant ?? "default"} size="lg">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/CtaBanner.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/CtaBanner.tsx src/components/marketing/CtaBanner.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/CtaBanner.tsx apps/dashboard/src/components/marketing/CtaBanner.test.tsx
git commit -m "feat(marketing): add CtaBanner component"
```

---

### Task 6: `SiteFooter` component

**Files:**
- Create: `apps/dashboard/src/components/marketing/layout/SiteFooter.tsx`
- Test: `apps/dashboard/src/components/marketing/layout/SiteFooter.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (self-contained link data, since footer links are mostly static navigation, not content that varies per-page).
- Produces: `SiteFooter({ brand }: { brand: "consultancy" | "receptionist" })`. Renders brand-specific link columns; sub-project 3 will pass `brand="receptionist"` on the AI Receptionist pages without needing changes to this file.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/layout/SiteFooter.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";

describe("SiteFooter", () => {
  it("renders consultancy-specific links when brand is consultancy", () => {
    render(<SiteFooter brand="consultancy" />);
    expect(screen.getByRole("link", { name: "Operations Automation" })).toHaveAttribute(
      "href",
      "/services/operations",
    );
    expect(screen.queryByRole("link", { name: "Plans & Pricing" })).not.toBeInTheDocument();
  });

  it("renders receptionist-specific links when brand is receptionist", () => {
    render(<SiteFooter brand="receptionist" />);
    expect(screen.getByRole("link", { name: "Plans & Pricing" })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByRole("link", { name: "Operations Automation" })).not.toBeInTheDocument();
  });

  it("always renders the shared company column", () => {
    render(<SiteFooter brand="consultancy" />);
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/layout/SiteFooter.test.tsx`
Expected: FAIL — `Cannot find module './SiteFooter'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/layout/SiteFooter.tsx
import Link from "next/link";

type FooterLink = { label: string; href: string };
type FooterColumn = { heading: string; links: FooterLink[] };

const CONSULTANCY_COLUMNS: FooterColumn[] = [
  {
    heading: "Services",
    links: [
      { label: "Operations Automation", href: "/services/operations" },
      { label: "Client Acquisition & Growth", href: "/services/acquisition" },
      { label: "AI-Powered Brand & Social", href: "/services/brand" },
    ],
  },
  {
    heading: "Why Halla",
    links: [
      { label: "Our AI Receptionist", href: "/design-preview/receptionist" },
    ],
  },
  {
    heading: "Get Started",
    links: [{ label: "Book a Diagnostic Call", href: "/consult-signup" }],
  },
];

const RECEPTIONIST_COLUMNS: FooterColumn[] = [
  {
    heading: "Solutions",
    links: [
      { label: "Plans & Pricing", href: "/pricing" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "ROI Calculator", href: "/roi" },
      { label: "Blog", href: "/blog" },
    ],
  },
];

const COMPANY_COLUMN: FooterColumn = {
  heading: "Company",
  links: [
    { label: "About Us", href: "/about" },
    { label: "Security", href: "/security" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Use", href: "/terms" },
  ],
};

export function SiteFooter({ brand }: { brand: "consultancy" | "receptionist" }) {
  const brandColumns = brand === "consultancy" ? CONSULTANCY_COLUMNS : RECEPTIONIST_COLUMNS;
  const columns = [...brandColumns, COMPANY_COLUMN];

  return (
    <footer className="border-t border-border bg-background px-6 py-16 text-foreground sm:px-10">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 sm:grid-cols-4">
        {columns.map((column) => (
          <div key={column.heading} className="flex flex-col gap-3">
            <h5 className="text-sm font-semibold text-foreground">{column.heading}</h5>
            {column.links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-foreground-secondary hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/layout/SiteFooter.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/layout/SiteFooter.tsx src/components/marketing/layout/SiteFooter.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/layout/SiteFooter.tsx apps/dashboard/src/components/marketing/layout/SiteFooter.test.tsx
git commit -m "feat(marketing): add brand-aware SiteFooter component"
```

---

### Task 7: Compose the full Consultancy page

**Files:**
- Modify: `apps/dashboard/src/app/(marketing)/design-preview/consultancy/page.tsx` (currently hero-only, from sub-project 1 commit d49a4a0)

**Interfaces:**
- Consumes: `HeroSection`, `StatBar`/`type Stat` (sub-project 1, unchanged), `FeatureGrid` (Task 2), `StepList` (Task 3), `ComparisonTable` (Task 4), `CtaBanner` (Task 5), `SiteFooter` (Task 6), `Marquee` from `@/components/magic-ui/marquee` (pre-existing, not part of any sub-project's new work), `CAPABILITIES`/`SERVICES`/`HOW_WE_WORK_STEPS`/`COMPARISON_ROWS` from `@/content/consultancy` (Task 1).
- Produces: the complete page at `/design-preview/consultancy`.

- [ ] **Step 1: Read the current file**

The existing file (from sub-project 1) renders `<div data-brand="consultancy" ...><HeroSection ...><StatBar .../></HeroSection></div>`. You are extending it, not starting over — keep the existing `HeroSection`/`StatBar` block exactly as-is and add the new sections after it.

- [ ] **Step 2: Write the extended page**

```tsx
// apps/dashboard/src/app/(marketing)/design-preview/consultancy/page.tsx
import type { Metadata } from "next";

import { HeroSection } from "@/components/marketing/HeroSection";
import { StatBar, type Stat } from "@/components/marketing/StatBar";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { StepList } from "@/components/marketing/StepList";
import { ComparisonTable } from "@/components/marketing/ComparisonTable";
import { CtaBanner } from "@/components/marketing/CtaBanner";
import { SiteFooter } from "@/components/marketing/layout/SiteFooter";
import { Marquee } from "@/components/magic-ui/marquee";
import { CAPABILITIES, SERVICES, HOW_WE_WORK_STEPS, COMPARISON_ROWS } from "@/content/consultancy";

export const metadata: Metadata = {
  title: "Halla AI Consultancy — We Don't Sell AI. We Install It.",
};

const STATS: Stat[] = [
  { value: "20", label: "hours/week reclaimed" },
  { value: "3", label: "connected systems" },
  { value: "1st", label: "responder wins the lead", accent: true },
];

export default function ConsultancyDesignPreviewPage() {
  return (
    <div data-brand="consultancy" className="min-h-screen bg-background">
      <HeroSection
        eyebrow="Halla AI Consultancy"
        headline={
          <>
            We Don&apos;t Sell AI.
            <br />
            We Install It.
          </>
        }
        subcopy="An implementation partner for small businesses — building connected systems for operations, client acquisition, and brand visibility. One direct point of contact, backed by a full AI engineering team."
        ctas={[
          { label: "Book a Diagnostic Call", href: "/consult-signup" },
          { label: "See the AI Receptionist", href: "/design-preview/receptionist", variant: "outline" },
        ]}
      >
        <div className="mt-4 w-full max-w-xl">
          <StatBar stats={STATS} />
        </div>
      </HeroSection>

      <div className="border-y border-border bg-card py-4">
        <Marquee pauseOnHover className="[--duration:30s]">
          {CAPABILITIES.map((capability) => (
            <span
              key={capability}
              className="mx-6 text-sm font-semibold uppercase tracking-wide text-foreground-secondary"
            >
              {capability}
            </span>
          ))}
        </Marquee>
      </div>

      <section className="px-6 py-20 sm:px-10 lg:px-16">
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2 md:items-center">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              Why it matters
            </span>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              Most small businesses are running on manual work they don&apos;t have to do
            </h2>
          </div>
          <p className="text-foreground-secondary">
            Every hour spent on repeat admin, unanswered leads, or a dormant social page is an
            hour that isn&apos;t going toward the work that actually grows the business.
            That&apos;s the gap the consultancy closes — with systems that stay running after
            we leave.
          </p>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              What We Build
            </span>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              Three systems. One connected operating layer.
            </h2>
            <p className="mt-3 text-foreground-secondary">
              Each engagement is scoped around your business, but most of our work falls into
              three connected areas.
            </p>
          </div>
          <div className="mt-12">
            <FeatureGrid items={SERVICES} />
          </div>
        </div>
      </section>

      <section className="border-t border-border px-6 py-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              How We Work
            </span>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              Every engagement starts the same way
            </h2>
            <p className="mt-3 text-foreground-secondary">
              Map the real workflow. Build production systems. Measure outcomes — not activity.
            </p>
          </div>
          <div className="mt-12">
            <StepList steps={HOW_WE_WORK_STEPS} />
          </div>
        </div>
      </section>

      <section className="border-t border-border px-6 py-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-4xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              Why Halla AI Consultancy
            </span>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              The alternative to slide decks and disconnected tools
            </h2>
          </div>
          <div className="mt-12">
            <ComparisonTable competitorLabel="Halla AI Consultancy" rows={COMPARISON_ROWS} />
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <CtaBanner
            eyebrow="Ready When You Are"
            headline="Let's map out where AI can move the needle in your business"
            subcopy="Book a diagnostic call. No slide deck, no jargon — just a clear look at where you're losing time and revenue, and what we'd build first."
            ctas={[
              { label: "Book Your Diagnostic Call", href: "/consult-signup" },
              { label: "See the AI Receptionist", href: "/design-preview/receptionist", variant: "outline" },
            ]}
          />
        </div>
      </section>

      <SiteFooter brand="consultancy" />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `cd apps/dashboard && npx eslint "src/app/(marketing)/design-preview/consultancy/page.tsx" --max-warnings=0`
Expected: no errors

- [ ] **Step 5: Manual verification**

Run: `cd apps/dashboard && npm run dev`, then open `http://localhost:3000/design-preview/consultancy`.
Expected: hero (unchanged from sub-project 1) followed by: scrolling capability marquee, "why it matters" two-column section, three service cards with the "Most requested" badge on the middle one, four-step timeline, comparison table, closing CTA banner, footer with Services/Why Halla/Get Started/Company columns. No console errors, no 3D/canvas anywhere, no horizontal overflow at 390px width.

- [ ] **Step 6: Commit**

```bash
git add "apps/dashboard/src/app/(marketing)/design-preview/consultancy/page.tsx"
git commit -m "feat(marketing): compose full consultancy page from new sections"
```

---

### Task 8: Playwright smoke test for the full page

**Files:**
- Modify: `e2e/journeys/marketing-hero-preview.spec.ts` (from sub-project 1, currently only checks the hero)

**Interfaces:**
- Consumes: `test`, `expect` from `../fixtures` (existing pattern, unchanged).

- [ ] **Step 1: Add a new test to the existing describe block**

Add this test inside the existing `test.describe('marketing hero design previews', ...)` block, after the existing three tests (do not remove or modify the existing three):

```ts
  test('consultancy page renders all sections with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/consultancy', { waitUntil: 'load' });
    await expect(page.getByText('Process Mapping').first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Three systems. One connected operating layer.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Operations Automation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Every engagement starts the same way' })).toBeVisible();
    await expect(page.getByText('Connected systems, not one-off tools')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: "Let's map out where AI can move the needle in your business" }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book Your Diagnostic Call' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests**

Run: `cd "E:\Halla AI" && PLAYWRIGHT_SKIP_GATEWAY=1 npx playwright test e2e/journeys/marketing-hero-preview.spec.ts --project=chromium`
Expected: all tests pass (the 3 existing plus this new one, plus the `[setup]` step)

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/marketing-hero-preview.spec.ts
git commit -m "test(marketing): add smoke coverage for the full consultancy page"
```

---

## Self-Review Notes

- **Spec coverage:** the spec's sub-project 2 list (marquee, service cards, "How We Work" steps, CTA blocks, footer) is covered by Tasks 2/3/5/6 plus the marquee usage in Task 7; the actual page also has a "why it matters" intro and a comparison table not explicitly named in the spec's bullet list but present on the real page being migrated — included in Task 7 as inline JSX (not a new reusable component, since neither repeats elsewhere) and via the new `ComparisonTable` component (Task 4) since a comparison table is a natural reusable primitive.
- **Placeholder scan:** none found — every step has complete, runnable code with real copy taken from the existing production page.
- **Type consistency:** `HeroCta` (defined in sub-project 1's `HeroSection.tsx`) is reused by `CtaBanner` rather than redefined; `ServiceItem`/`TimelineStep`/`ComparisonRow` (Task 1) are each consumed by exactly one downstream component with matching shapes.
