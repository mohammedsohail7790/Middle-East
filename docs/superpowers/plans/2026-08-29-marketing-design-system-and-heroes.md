# Marketing Design System + Both Heroes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the brand-themed design-system tokens, the reusable `Card`/`Separator`/`StatBar`/`HeroSection` components, and standalone Consultancy + AI Receptionist hero pages, with zero 3D/canvas code, previewable at `/design-preview/consultancy` and `/design-preview/receptionist`.

**Architecture:** New components live in `apps/dashboard/src/components/ui/` (shadcn-pattern primitives) and `apps/dashboard/src/components/marketing/` (marketing-specific). Brand theming is a `data-brand="consultancy" | "receptionist"` attribute on a wrapping element, driving CSS custom properties already consumed by Tailwind's existing `bg-background`/`text-primary`/etc. utility classes (see `apps/dashboard/tailwind.config.js`). The two hero pages ship first at temporary `/design-preview/*` routes (not the live `/consultancy` or `/` routes yet) — the live routes still serve the vanilla SPA until sub-projects 2 and 3 finish the rest of each page's content, per the spec's incremental-per-page migration approach. Swapping `/design-preview/consultancy` in for the real `/consultancy` route is a follow-up task once sub-project 2 lands, not part of this plan.

`apps/dashboard` currently has zero component-level tests (root `vitest.config.ts` only scans root-level `tests/`, with a `node` environment — no jsdom, no React plugin, no `@testing-library/react` anywhere in the repo). Task 2 below adds that infrastructure once, so every component task after it has a real TDD cycle instead of relying only on manual verification.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, `class-variance-authority` (cva), `@radix-ui/react-separator`, `lucide-react`, Vitest + `@testing-library/react` (component tests), Playwright (e2e).

## Global Constraints

- No `@react-three/fiber`, `@react-three/drei`, `three`, or any canvas/WebGL code in any file this plan creates.
- Follow the existing shadcn pattern exactly (see `apps/dashboard/src/components/ui/button.tsx`): `cva` for variants, `cn()` from `@/lib/utils` for class merging, `React.forwardRef`, named export alongside the variants export.
- Brand colors (from the spec): consultancy = near-black background `#0a0708`, purple primary `#7C3AED`, red accent `#EF4444`. Receptionist = white background `#ffffff`, teal primary `#0D9488`.
- No hand-written `@media` breakpoints — use Tailwind responsive utilities (`sm:`, `md:`, `lg:`) only.
- Every new component gets a Vitest component test before being wired into a page; both hero pages additionally get Playwright smoke coverage (Task 9).
- Run `cd apps/dashboard && npx tsc --noEmit` and `npx eslint <changed files> --max-warnings=0` after every task; both must pass before moving to the next task.

---

### Task 1: Brand theme tokens

**Files:**
- Modify: `apps/dashboard/src/app/globals.css` (append a new block; do not touch existing rules)

**Interfaces:**
- Produces: `[data-brand="consultancy"]` and `[data-brand="receptionist"]` selectors that redefine `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--accent` (used as the secondary/red accent for consultancy), `--border`. Later tasks apply `data-brand` to a wrapping `<div>` and consume these via existing Tailwind classes (`bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`).

- [ ] **Step 1: Append the brand theme block**

Add this to the end of `apps/dashboard/src/app/globals.css`:

```css
/* ============ Marketing brand themes ============ */
/* Scoped via [data-brand] so both brands can coexist on the same app
   without affecting the dashboard's own --background/--primary tokens. */
[data-brand="consultancy"] {
  --background: #0a0708;
  --foreground: #f8fafc;
  --foreground-secondary: rgba(248, 250, 252, 0.7);
  --primary: #7c3aed;
  --primary-foreground: #ffffff;
  --accent: #ef4444;
  --accent-foreground: #ffffff;
  --border: rgba(255, 255, 255, 0.12);
  --card: #120f14;
  --card-foreground: #f8fafc;
}

[data-brand="receptionist"] {
  --background: #ffffff;
  --foreground: #0a0a0a;
  --foreground-secondary: rgba(10, 10, 10, 0.65);
  --primary: #0d9488;
  --primary-foreground: #ffffff;
  --accent: #0d9488;
  --accent-foreground: #ffffff;
  --border: rgba(10, 10, 10, 0.1);
  --card: #f8fafc;
  --card-foreground: #0a0a0a;
}
```

- [ ] **Step 2: Verify nothing else broke**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: no errors (CSS isn't type-checked, this just confirms the task didn't break anything else).

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/app/globals.css
git commit -m "feat(marketing): add consultancy/receptionist brand theme tokens"
```

---

### Task 2: Component-testing infrastructure

**Files:**
- Modify: `apps/dashboard/package.json` (add devDependencies)
- Create: `apps/dashboard/vitest.config.ts`
- Create: `apps/dashboard/vitest.setup.ts`
- Create: `apps/dashboard/src/components/ui/__tests__/sanity.test.tsx` (deleted in Step 5 once Task 3 provides a real test — this step only proves the harness itself works)

**Interfaces:**
- Produces: a working `npx vitest run` command scoped to `apps/dashboard`, with `describe`/`it`/`expect` globals, jsdom environment, JSX support, and `@testing-library/react`'s `render`/`screen` available to every subsequent task.

- [ ] **Step 1: Install the test dependencies**

Run: `cd apps/dashboard && npm install --save-dev --save-exact @testing-library/react@16.1.0 @testing-library/jest-dom@6.6.3 @vitejs/plugin-react@4.3.4 jsdom@25.0.1`
Expected: exits 0, `package.json` devDependencies gain the four packages above.

- [ ] **Step 2: Write the Vitest config**

```ts
// apps/dashboard/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "./vitest.setup.ts")],
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

```ts
// apps/dashboard/vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Write a sanity test to prove the harness works**

```tsx
// apps/dashboard/src/components/ui/__tests__/sanity.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("component test harness", () => {
  it("can render a component and query the DOM", () => {
    render(<button>Click me</button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it**

Run: `cd apps/dashboard && npx vitest run`
Expected: PASS (1 test) — confirms jsdom, JSX, and `@testing-library/react` all work together.

- [ ] **Step 5: Remove the sanity test**

It was only scaffolding to prove the harness; real component tests start in Task 3.

Run: `rm apps/dashboard/src/components/ui/__tests__/sanity.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/package-lock.json apps/dashboard/vitest.config.ts apps/dashboard/vitest.setup.ts
git commit -m "test(dashboard): add Vitest + Testing Library component-test harness"
```

---

### Task 3: `Card` primitive

**Files:**
- Create: `apps/dashboard/src/components/ui/card.tsx`
- Test: `apps/dashboard/src/components/ui/card.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` — all `React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>`. Later tasks (`StatBar`) import `Card` and `CardContent`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/ui/card.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardContent, CardTitle } from "./card";

describe("Card", () => {
  it("renders children inside a card with content and title", () => {
    render(
      <Card data-testid="card">
        <CardContent>
          <CardTitle>Hello</CardTitle>
        </CardContent>
      </Card>,
    );
    expect(screen.getByTestId("card")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/ui/card.test.tsx`
Expected: FAIL — `Cannot find module './card'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/ui/card.tsx
import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-2xl border border-border bg-card text-card-foreground", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-foreground-secondary", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/ui/card.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/ui/card.tsx src/components/ui/card.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/ui/card.tsx apps/dashboard/src/components/ui/card.test.tsx
git commit -m "feat(ui): add Card primitive"
```

---

### Task 4: `Separator` primitive

**Files:**
- Create: `apps/dashboard/src/components/ui/separator.tsx`
- Test: `apps/dashboard/src/components/ui/separator.test.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-separator` (already installed), `cn` from `@/lib/utils`.
- Produces: `Separator` — `React.forwardRef<React.ElementRef<typeof SeparatorPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>>`, default `orientation="horizontal"`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/ui/separator.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Separator } from "./separator";

describe("Separator", () => {
  it("renders a horizontal separator by default", () => {
    const { container } = render(<Separator data-testid="sep" />);
    const el = container.querySelector('[data-testid="sep"]');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-orientation", "horizontal");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/ui/separator.test.tsx`
Expected: FAIL — `Cannot find module './separator'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/ui/separator.tsx
import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "shrink-0 bg-border",
      orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
      className,
    )}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/ui/separator.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/ui/separator.tsx src/components/ui/separator.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/ui/separator.tsx apps/dashboard/src/components/ui/separator.test.tsx
git commit -m "feat(ui): add Separator primitive"
```

---

### Task 5: `StatBar` marketing component

**Files:**
- Create: `apps/dashboard/src/components/marketing/StatBar.tsx`
- Test: `apps/dashboard/src/components/marketing/StatBar.test.tsx`

**Interfaces:**
- Consumes: `Card`, `CardContent` from `@/components/ui/card`.
- Produces: `StatBar`, `type Stat = { value: string; label: string; accent?: boolean }`, prop `stats: Stat[]`. Later tasks (both hero pages) import `StatBar` and `type Stat`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/StatBar.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatBar } from "./StatBar";

describe("StatBar", () => {
  it("renders one card per stat with its value and label", () => {
    render(
      <StatBar
        stats={[
          { value: "20", label: "hours/week reclaimed" },
          { value: "3", label: "connected systems" },
          { value: "1st", label: "responder wins the lead", accent: true },
        ]}
      />,
    );
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("hours/week reclaimed")).toBeInTheDocument();
    expect(screen.getByText("1st")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/StatBar.test.tsx`
Expected: FAIL — `Cannot find module './StatBar'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/StatBar.tsx
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Stat = {
  value: string;
  label: string;
  accent?: boolean;
};

export function StatBar({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4 text-center">
            <div className={cn("text-2xl font-bold text-foreground", stat.accent && "text-primary")}>
              {stat.value}
            </div>
            <div className="mt-1 text-xs text-foreground-secondary">{stat.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/StatBar.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/StatBar.tsx src/components/marketing/StatBar.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/StatBar.tsx apps/dashboard/src/components/marketing/StatBar.test.tsx
git commit -m "feat(marketing): add StatBar component"
```

---

### Task 6: `HeroSection` marketing component

**Files:**
- Create: `apps/dashboard/src/components/marketing/HeroSection.tsx`
- Test: `apps/dashboard/src/components/marketing/HeroSection.test.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button` (existing), `cn` from `@/lib/utils`.
- Produces: `HeroSection` with props:
  ```ts
  type HeroCta = { label: string; href: string; variant?: "default" | "outline" };
  type HeroSectionProps = {
    eyebrow: string;
    headline: React.ReactNode;
    subcopy: string;
    ctas: HeroCta[];
    align?: "left" | "center"; // default "left"
    children?: React.ReactNode; // rendered below the CTAs (e.g. StatBar)
  };
  ```
  Later tasks (both hero pages) import `HeroSection` and `type HeroCta`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/HeroSection.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroSection } from "./HeroSection";

describe("HeroSection", () => {
  it("renders eyebrow, headline, subcopy, and CTA links", () => {
    render(
      <HeroSection
        eyebrow="Halla AI Consultancy"
        headline="We Don't Sell AI. We Install It."
        subcopy="An implementation partner for small businesses."
        ctas={[
          { label: "Book a Diagnostic Call", href: "/consult-signup" },
          { label: "See the AI Receptionist", href: "/", variant: "outline" },
        ]}
      />,
    );
    expect(screen.getByText("Halla AI Consultancy")).toBeInTheDocument();
    expect(screen.getByText("We Don't Sell AI. We Install It.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book a Diagnostic Call" })).toHaveAttribute(
      "href",
      "/consult-signup",
    );
    expect(screen.getByRole("link", { name: "See the AI Receptionist" })).toBeInTheDocument();
  });

  it("renders children below the CTAs", () => {
    render(
      <HeroSection eyebrow="e" headline="h" subcopy="s" ctas={[]}>
        <div data-testid="extra">extra content</div>
      </HeroSection>,
    );
    expect(screen.getByTestId("extra")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/HeroSection.test.tsx`
Expected: FAIL — `Cannot find module './HeroSection'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/HeroSection.tsx
import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HeroCta = {
  label: string;
  href: string;
  variant?: "default" | "outline";
};

export type HeroSectionProps = {
  eyebrow: string;
  headline: React.ReactNode;
  subcopy: string;
  ctas: HeroCta[];
  align?: "left" | "center";
  children?: React.ReactNode;
};

export function HeroSection({
  eyebrow,
  headline,
  subcopy,
  ctas,
  align = "left",
  children,
}: HeroSectionProps) {
  return (
    <section
      className={cn(
        "bg-background px-6 py-24 text-foreground sm:px-10 lg:px-16",
        align === "center" && "text-center",
      )}
    >
      <div className={cn("mx-auto flex max-w-3xl flex-col gap-6", align === "center" && "items-center")}>
        <span className="inline-flex w-fit items-center rounded-full bg-primary/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          {eyebrow}
        </span>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">{headline}</h1>
        <p className="max-w-xl text-lg text-foreground-secondary">{subcopy}</p>
        {ctas.length > 0 && (
          <div className={cn("flex flex-wrap gap-3", align === "center" && "justify-center")}>
            {ctas.map((cta) => (
              <Button key={cta.label} asChild variant={cta.variant ?? "default"} size="lg">
                <Link href={cta.href}>{cta.label}</Link>
              </Button>
            ))}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/HeroSection.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/HeroSection.tsx src/components/marketing/HeroSection.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/HeroSection.tsx apps/dashboard/src/components/marketing/HeroSection.test.tsx
git commit -m "feat(marketing): add HeroSection component"
```

---

### Task 7: Consultancy hero preview page

**Files:**
- Create: `apps/dashboard/src/app/(marketing)/design-preview/consultancy/page.tsx`

**Interfaces:**
- Consumes: `HeroSection` (Task 6), `StatBar` + `type Stat` (Task 5).
- Produces: a page rendered at `/design-preview/consultancy`.

- [ ] **Step 1: Write the page**

```tsx
// apps/dashboard/src/app/(marketing)/design-preview/consultancy/page.tsx
import type { Metadata } from "next";

import { HeroSection } from "@/components/marketing/HeroSection";
import { StatBar, type Stat } from "@/components/marketing/StatBar";

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
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `cd apps/dashboard && npx eslint "src/app/(marketing)/design-preview/consultancy/page.tsx" --max-warnings=0`
Expected: no errors

- [ ] **Step 4: Manual verification**

Run: `cd apps/dashboard && npm run dev`, then open `http://localhost:3000/design-preview/consultancy`.
Expected: black background, purple eyebrow badge and CTA, headline "We Don't Sell AI. / We Install It.", subcopy, two buttons, three stat cards below — no console errors, no 3D/canvas element anywhere on the page.

- [ ] **Step 5: Commit**

```bash
git add "apps/dashboard/src/app/(marketing)/design-preview/consultancy/page.tsx"
git commit -m "feat(marketing): add consultancy hero design-preview page"
```

---

### Task 8: AI Receptionist hero preview page

**Files:**
- Create: `apps/dashboard/src/app/(marketing)/design-preview/receptionist/page.tsx`

**Interfaces:**
- Consumes: `HeroSection` (Task 6), `StatBar` + `type Stat` (Task 5).
- Produces: a page rendered at `/design-preview/receptionist`.

- [ ] **Step 1: Write the page**

```tsx
// apps/dashboard/src/app/(marketing)/design-preview/receptionist/page.tsx
import type { Metadata } from "next";

import { HeroSection } from "@/components/marketing/HeroSection";
import { StatBar, type Stat } from "@/components/marketing/StatBar";

export const metadata: Metadata = {
  title: "Halla AI — Your Business Deserves an AI That Never Sleeps",
};

const STATS: Stat[] = [
  { value: "24/7", label: "Always Answering" },
  { value: "$39", label: "Starting / Month" },
  { value: "28", label: "Industries Served" },
  { value: "15min", label: "Setup Time" },
];

export default function ReceptionistDesignPreviewPage() {
  return (
    <div data-brand="receptionist" className="min-h-screen bg-background">
      <HeroSection
        align="center"
        eyebrow="14-Day Free Trial — No Credit Card Required"
        headline={
          <>
            Your Business Deserves
            <br />
            an AI That Never Sleeps
          </>
        }
        subcopy="Halla AI answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically. Starting at $39/month."
        ctas={[
          { label: "Get My AI Receptionist", href: "/signup" },
          { label: "See How It Works", href: "/how-it-works", variant: "outline" },
        ]}
      >
        <div className="mt-4 w-full max-w-2xl">
          <StatBar stats={STATS} />
        </div>
      </HeroSection>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `cd apps/dashboard && npx eslint "src/app/(marketing)/design-preview/receptionist/page.tsx" --max-warnings=0`
Expected: no errors

- [ ] **Step 4: Manual verification**

Run: `cd apps/dashboard && npm run dev`, then open `http://localhost:3000/design-preview/receptionist`.
Expected: white background, teal eyebrow/CTA, centered headline "Your Business Deserves / an AI That Never Sleeps", subcopy, two buttons, four stat cards below — no console errors, no canvas/waveform element anywhere on the page.

Note: `StatBar`'s grid is `sm:grid-cols-3`; with 4 stats here the 4th wraps to a second row on small screens, which is expected and fine (`StatBar` doesn't hardcode a stat count).

- [ ] **Step 5: Commit**

```bash
git add "apps/dashboard/src/app/(marketing)/design-preview/receptionist/page.tsx"
git commit -m "feat(marketing): add AI Receptionist hero design-preview page"
```

---

### Task 9: Playwright smoke tests for both preview pages

**Files:**
- Create: `e2e/journeys/marketing-hero-preview.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect` from `../fixtures` (existing pattern, see `e2e/journeys/auth.spec.ts`).

- [ ] **Step 1: Write the test**

```ts
// e2e/journeys/marketing-hero-preview.spec.ts
import { test, expect } from '../fixtures';

test.describe('marketing hero design previews', () => {
  test('consultancy hero renders with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/consultancy', { waitUntil: 'load' });
    await expect(page.getByText("We Don't Sell AI.")).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book a Diagnostic Call' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('receptionist hero renders with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist', { waitUntil: 'load' });
    await expect(page.getByText('an AI That Never Sleeps')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get My AI Receptionist' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('consultancy hero has no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/design-preview/consultancy', { waitUntil: 'load' });
    const scrollWidth = await page.evaluate(() => document.scrollingElement?.scrollWidth ?? 0);
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test e2e/journeys/marketing-hero-preview.spec.ts`
Expected: 3 passed

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/marketing-hero-preview.spec.ts
git commit -m "test(marketing): add Playwright smoke tests for hero design previews"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers design-system tokens; Task 2 covers test infrastructure (a prerequisite the spec didn't call out explicitly but that TDD in this codebase requires); Tasks 3-4 cover the two new `ui/` primitives actually needed by this sub-project's components (`card`, `separator` — the spec's full primitive list of 10 includes several, like `tabs`/`accordion`/`dialog`, that no component in *this* plan consumes; they're deferred to whichever sub-project 2/3 task first needs them, per YAGNI); Tasks 5-6 cover the two marketing components (`StatBar`, `HeroSection`); Tasks 7-8 cover both hero pages; Task 9 covers the spec's Playwright smoke-coverage and mobile-overflow testing requirement.
- **Placeholder scan:** none found — every step has complete, runnable code.
- **Type consistency:** `StatBar`'s `stats: Stat[]` prop and `HeroSection`'s `ctas: HeroCta[]` prop are defined once (Tasks 5, 6) and consumed with matching shapes in Tasks 7-8.
