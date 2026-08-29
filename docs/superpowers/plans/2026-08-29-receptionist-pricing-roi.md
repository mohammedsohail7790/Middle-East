# Receptionist Pricing & ROI Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Pricing" section of the AI Receptionist product site — a single pricing page with three plan cards, an annual-billing savings table, a full feature comparison matrix, and an interactive ROI calculator — inside the existing Next.js App Router marketing rebuild.

**Architecture:** A typed `content/pricing.ts` data file feeds a non-interactive `PricingTable` (plan cards) and `PricingFeatureTable` (feature matrix) component. `RoiCalculator` is the one genuinely interactive client component in this slice — a small controlled-input form replicating production's `calcROI()` math client-side. All four pieces compose onto one route under the existing `/design-preview/receptionist` preview tree, per the same convention established in the Industries slice — the design spec frames the ROI calculator as living on the pricing page itself ("RoiCalculator as the one genuinely interactive client component on this page"), so this plan does not create a separate `/roi` route even though production's vanilla SPA does.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind (existing design tokens + `data-brand="receptionist"`), React `useState` (client component), `lucide-react` icons, Vitest + React Testing Library, Playwright.

## Global Constraints

- No 3D visualization, canvas, or `@react-three/fiber` usage anywhere in these pages.
- Tailwind utility classes and existing design-token CSS custom properties only (`--background`, `--foreground`, `--foreground-secondary`, `--primary`, `--primary-foreground`, `--accent`, `--border`, `--card`, `--card-foreground`, `--muted`, `--muted-foreground` — all already defined under `[data-brand="receptionist"]` in `globals.css`). No hand-written custom breakpoints.
- TypeScript strict; no `any`.
- Keep files under 500 lines.
- Content only — pricing figures, plan features, and the ROI formula are transcribed verbatim from `Marketing site/index.html` (pricing page markup, lines 804-895) and `Marketing site/halla_main.js` (`calcROI()`, lines 173-189, and the ROI page defaults at `Marketing site/index.html` lines 2211-2232). Do not invent or round differently than production.
- Any client-interactive component (`RoiCalculator`) must have `"use client";` as its first line — confirmed necessary in this repo per the prior sub-project's final review finding on the Accordion primitive.
- Follow shadcn/ui-style patterns already established in this repo: `cn()` from `@/lib/utils`, plain function components for marketing composites, `Button`/`Card`/`CardContent` from `@/components/ui/*` where they fit.

---

### Task 1: `content/pricing.ts` content data

**Files:**
- Create: `apps/dashboard/src/content/pricing.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type PricingPlan = { id: string; name: string; price: number; priceSuffix: string; minutesLabel: string; ctaLabel: string; ctaVariant: "default" | "outline"; popular?: boolean; features: string[]; missingFeatures: string[] }`; `PRICING_PLANS: PricingPlan[]` (3 entries); `type AnnualSavingsRow = { plan: string; annualPrice: string; effectiveMonthly: string; savings: string }`; `ANNUAL_SAVINGS_ROWS: AnnualSavingsRow[]`; `type FeatureComparisonRow = { feature: string; essential: string; professional: string; enterprise: string }`; `FEATURE_COMPARISON_ROWS: FeatureComparisonRow[]`; `type RoiPlanOption = { label: string; value: number }`; `ROI_PLAN_OPTIONS: RoiPlanOption[]`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/dashboard/src/content/pricing.test.ts
import { describe, expect, it } from "vitest";
import { ANNUAL_SAVINGS_ROWS, FEATURE_COMPARISON_ROWS, PRICING_PLANS, ROI_PLAN_OPTIONS } from "./pricing";

describe("pricing content", () => {
  it("has 3 pricing plans with the exact production prices", () => {
    const prices = PRICING_PLANS.map((p) => p.price).sort((a, b) => a - b);
    expect(prices).toEqual([39, 149, 499]);
  });

  it("marks exactly one plan as popular", () => {
    expect(PRICING_PLANS.filter((p) => p.popular)).toHaveLength(1);
    expect(PRICING_PLANS.find((p) => p.popular)?.name).toBe("Professional");
  });

  it("has 3 annual savings rows and 13 feature comparison rows", () => {
    expect(ANNUAL_SAVINGS_ROWS).toHaveLength(3);
    expect(FEATURE_COMPARISON_ROWS).toHaveLength(13);
  });

  it("has exactly 2 ROI plan options matching production's calculator", () => {
    expect(ROI_PLAN_OPTIONS).toEqual([
      { label: "Essential — $39/mo", value: 39 },
      { label: "Professional — $149/mo", value: 149 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/content/pricing.test.ts`
Expected: FAIL — `Cannot find module './pricing'`

- [ ] **Step 3: Write the implementation**

Content transcribed verbatim from `Marketing site/index.html` lines 804-895 (pricing cards, annual savings table, feature comparison table) and lines 2217-2221 (ROI plan select options).

```ts
// apps/dashboard/src/content/pricing.ts
export type PricingPlan = {
  id: string;
  name: string;
  price: number;
  priceSuffix: string;
  minutesLabel: string;
  ctaLabel: string;
  ctaVariant: "default" | "outline";
  popular?: boolean;
  features: string[];
  missingFeatures: string[];
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "essential",
    name: "Essential",
    price: 39,
    priceSuffix: "/mo",
    minutesLabel: "250 min · $0.20/min overage",
    ctaLabel: "Start Free Trial",
    ctaVariant: "outline",
    features: [
      "24/7 AI receptionist",
      "7 Languages",
      "Call forwarding",
      "Voicemail-to-text",
      "Appointment booking",
      "Email summaries",
      "Live chat (7am–3pm ET)",
      "1 phone number",
    ],
    missingFeatures: ["CRM integration", "Native calendar sync", "Custom AI voice"],
  },
  {
    id: "professional",
    name: "Professional",
    price: 149,
    priceSuffix: "/mo",
    minutesLabel: "750 min · $0.15/min overage",
    ctaLabel: "Start Free Trial",
    ctaVariant: "default",
    popular: true,
    features: [
      "Everything in Essential",
      "CRM (HubSpot, Salesforce, Pipedrive)",
      "Google Calendar + Outlook sync",
      "Custom AI voice training",
      "3 phone numbers",
    ],
    missingFeatures: ["Dedicated account manager"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 499,
    priceSuffix: "/mo",
    minutesLabel: "4,000 min · $0.10/min overage",
    ctaLabel: "Start Free Trial",
    ctaVariant: "outline",
    features: [
      "Everything in Professional",
      "Dedicated account manager",
      "99.9% uptime SLA",
      "Advanced analytics & reporting",
      "20+ phone numbers",
      "Custom data residency options",
    ],
    missingFeatures: [],
  },
];

export type AnnualSavingsRow = {
  plan: string;
  annualPrice: string;
  effectiveMonthly: string;
  savings: string;
};

export const ANNUAL_SAVINGS_ROWS: AnnualSavingsRow[] = [
  { plan: "Essential", annualPrice: "$375/year", effectiveMonthly: "$31.25", savings: "Save $93/year" },
  { plan: "Professional", annualPrice: "$1,430/year", effectiveMonthly: "$119.17", savings: "Save $358/year" },
  { plan: "Enterprise", annualPrice: "$4,790/year", effectiveMonthly: "$399.17", savings: "Save $1,198/year" },
];

export type FeatureComparisonRow = {
  feature: string;
  essential: string;
  professional: string;
  enterprise: string;
};

export const FEATURE_COMPARISON_ROWS: FeatureComparisonRow[] = [
  { feature: "Monthly price", essential: "$39", professional: "$149", enterprise: "$499" },
  { feature: "Included minutes", essential: "250", professional: "750", enterprise: "4,000" },
  { feature: "Overage rate", essential: "$0.20/min", professional: "$0.15/min", enterprise: "$0.10/min" },
  { feature: "24/7 AI receptionist", essential: "✓", professional: "✓", enterprise: "✓" },
  { feature: "7 Languages", essential: "✓", professional: "✓", enterprise: "✓" },
  { feature: "Spam blocking", essential: "✓", professional: "✓", enterprise: "✓" },
  { feature: "CRM integration", essential: "Basic (Zapier)", professional: "Full (Native + Zapier)", enterprise: "Full + custom API" },
  { feature: "Native calendar sync", essential: "—", professional: "✓", enterprise: "✓" },
  { feature: "Custom AI voice", essential: "—", professional: "✓", enterprise: "✓" },
  { feature: "Phone numbers", essential: "1", professional: "3", enterprise: "20+" },
  { feature: "Dedicated account manager", essential: "—", professional: "—", enterprise: "✓" },
  { feature: "Uptime SLA", essential: "—", professional: "—", enterprise: "99.9%" },
  { feature: "Call recording", essential: "Optional, opt-in", professional: "Optional, opt-in", enterprise: "Optional, opt-in" },
];

export type RoiPlanOption = { label: string; value: number };

export const ROI_PLAN_OPTIONS: RoiPlanOption[] = [
  { label: "Essential — $39/mo", value: 39 },
  { label: "Professional — $149/mo", value: 149 },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/content/pricing.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/content/pricing.ts src/content/pricing.test.ts --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/content/pricing.ts apps/dashboard/src/content/pricing.test.ts
git commit -m "feat(marketing): add pricing content data"
```

---

### Task 2: `PricingTable` component

**Files:**
- Create: `apps/dashboard/src/components/marketing/PricingTable.tsx`
- Test: `apps/dashboard/src/components/marketing/PricingTable.test.tsx`

**Interfaces:**
- Consumes: `type PricingPlan`, `PRICING_PLANS` from `@/content/pricing` (Task 1); `Card`, `CardContent` from `@/components/ui/card`; `Button` from `@/components/ui/button`; `Check`, `X` from `lucide-react`; `next/link`.
- Produces: `PricingTable({ plans }: { plans: PricingPlan[] })`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/PricingTable.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingTable } from "./PricingTable";
import { PRICING_PLANS } from "@/content/pricing";

describe("PricingTable", () => {
  it("renders each plan's name, price, and CTA link to signup", () => {
    render(<PricingTable plans={PRICING_PLANS} />);
    expect(screen.getByText("Essential")).toBeInTheDocument();
    expect(screen.getByText("Professional")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Start Free Trial" })).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: "Start Free Trial" })[0]).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("shows the popular badge only on the Professional plan", () => {
    render(<PricingTable plans={PRICING_PLANS} />);
    expect(screen.getByText("Most Popular")).toBeInTheDocument();
    expect(screen.getAllByText("Most Popular")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/PricingTable.test.tsx`
Expected: FAIL — `Cannot find module './PricingTable'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/PricingTable.tsx
import Link from "next/link";
import { Check, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PricingPlan } from "@/content/pricing";

export function PricingTable({ plans }: { plans: PricingPlan[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {plans.map((plan) => (
        <Card
          key={plan.id}
          className={cn("relative flex flex-col", plan.popular && "border-primary ring-1 ring-primary")}
        >
          {plan.popular && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              Most Popular
            </span>
          )}
          <CardContent className="flex flex-1 flex-col p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground-secondary">
              {plan.name}
            </h3>
            <p className="mt-2 text-3xl font-bold text-foreground">
              ${plan.price}
              <span className="text-base font-medium text-foreground-secondary">{plan.priceSuffix}</span>
            </p>
            <p className="mt-1 text-xs text-foreground-secondary">{plan.minutesLabel}</p>

            <Button asChild variant={plan.ctaVariant} className="mt-6 w-full">
              <Link href="/signup">{plan.ctaLabel}</Link>
            </Button>

            <div className="mt-6 flex flex-col gap-2">
              {plan.features.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {feature}
                </div>
              ))}
              {plan.missingFeatures.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-2 text-sm text-foreground-secondary opacity-60"
                >
                  <X className="mt-0.5 size-4 shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/PricingTable.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/PricingTable.tsx src/components/marketing/PricingTable.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/PricingTable.tsx apps/dashboard/src/components/marketing/PricingTable.test.tsx
git commit -m "feat(marketing): add PricingTable component"
```

---

### Task 3: `RoiCalculator` client component

**Files:**
- Create: `apps/dashboard/src/components/marketing/RoiCalculator.tsx`
- Test: `apps/dashboard/src/components/marketing/RoiCalculator.test.tsx`

**Interfaces:**
- Consumes: `ROI_PLAN_OPTIONS` from `@/content/pricing` (Task 1); `Button` from `@/components/ui/button`; `next/link`; React `useState`.
- Produces: `RoiCalculator()` (no props — self-contained interactive widget with its own local state, matching production's `calcROI()` behavior). Must start with `"use client";`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/RoiCalculator.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoiCalculator } from "./RoiCalculator";

describe("RoiCalculator", () => {
  it("computes revenue recovered from the default inputs (20 missed calls, $500 value, 30% conversion, $149 plan)", () => {
    render(<RoiCalculator />);
    // monthly = round(20 * 0.30 * 500) = 3000; annual = 36000; cost = 149*12 = 1788; net = 34212
    expect(screen.getByText("$3,000")).toBeInTheDocument();
    expect(screen.getByText("$36,000")).toBeInTheDocument();
    expect(screen.getByText("$1,788")).toBeInTheDocument();
    expect(screen.getByText("$34,212")).toBeInTheDocument();
  });

  it("recomputes when the missed-calls input changes", () => {
    render(<RoiCalculator />);
    const missedInput = screen.getByLabelText("Monthly Calls You Currently Miss");
    fireEvent.change(missedInput, { target: { value: "40" } });
    // monthly = round(40 * 0.30 * 500) = 6000
    expect(screen.getByText("$6,000")).toBeInTheDocument();
  });

  it("has a CTA linking to signup", () => {
    render(<RoiCalculator />);
    expect(screen.getByRole("link", { name: /Start Free Trial/ })).toHaveAttribute("href", "/signup");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/RoiCalculator.test.tsx`
Expected: FAIL — `Cannot find module './RoiCalculator'`

- [ ] **Step 3: Write the implementation**

Formula transcribed verbatim from `Marketing site/halla_main.js` lines 174-189 (`calcROI()`), defaults from `Marketing site/index.html` lines 2218-2221.

```tsx
// apps/dashboard/src/components/marketing/RoiCalculator.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ROI_PLAN_OPTIONS } from "@/content/pricing";

function formatCurrency(value: number): string {
  return "$" + Math.round(value).toLocaleString("en-US");
}

export function RoiCalculator() {
  const [missedCalls, setMissedCalls] = useState(20);
  const [jobValue, setJobValue] = useState(500);
  const [conversionRate, setConversionRate] = useState(30);
  const [plan, setPlan] = useState(149);

  const monthly = Math.round(missedCalls * (conversionRate / 100) * jobValue);
  const annual = monthly * 12;
  const cost = plan * 12;
  const net = Math.max(0, annual - cost);
  const multiplier = cost > 0 ? (annual / cost).toFixed(1) : "∞";

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-foreground">Your Business</h3>

        <label className="flex flex-col gap-1.5 text-sm text-foreground-secondary">
          Monthly Calls You Currently Miss
          <input
            type="number"
            aria-label="Monthly Calls You Currently Miss"
            value={missedCalls}
            onChange={(e) => setMissedCalls(Number(e.target.value) || 0)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-foreground-secondary">
          Average Job / Sale Value ($)
          <input
            type="number"
            aria-label="Average Job / Sale Value ($)"
            value={jobValue}
            onChange={(e) => setJobValue(Number(e.target.value) || 0)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-foreground-secondary">
          % of Answered Calls That Convert
          <input
            type="number"
            min={1}
            max={100}
            aria-label="% of Answered Calls That Convert"
            value={conversionRate}
            onChange={(e) => setConversionRate(Number(e.target.value) || 0)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-foreground-secondary">
          Plan
          <select
            aria-label="Plan"
            value={plan}
            onChange={(e) => setPlan(Number(e.target.value))}
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          >
            {ROI_PLAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-primary bg-primary/10 p-5">
          <p className="text-2xl font-bold text-foreground">{formatCurrency(monthly)}</p>
          <p className="text-sm text-foreground-secondary">Monthly Revenue Recovered</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-2xl font-bold text-foreground">{formatCurrency(annual)}</p>
          <p className="text-sm text-foreground-secondary">Annual Revenue Recovered</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-2xl font-bold text-foreground-secondary">{formatCurrency(cost)}</p>
          <p className="text-sm text-foreground-secondary">Annual Halla AI Cost</p>
        </div>
        <div className="rounded-xl border border-primary bg-primary/10 p-5">
          <p className="text-2xl font-bold text-foreground">{formatCurrency(net)}</p>
          <p className="text-sm text-foreground-secondary">
            Net Annual ROI — {multiplier}x your investment
          </p>
        </div>
        <Button asChild size="lg" className="mt-2 w-full">
          <Link href="/signup">Start Free Trial — Capture This Revenue</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/RoiCalculator.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/RoiCalculator.tsx src/components/marketing/RoiCalculator.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/RoiCalculator.tsx apps/dashboard/src/components/marketing/RoiCalculator.test.tsx
git commit -m "feat(marketing): add RoiCalculator client component"
```

---

### Task 4: `PricingFeatureTable` component

**Files:**
- Create: `apps/dashboard/src/components/marketing/PricingFeatureTable.tsx`
- Test: `apps/dashboard/src/components/marketing/PricingFeatureTable.test.tsx`

**Interfaces:**
- Consumes: `type FeatureComparisonRow` from `@/content/pricing` (Task 1).
- Produces: `PricingFeatureTable({ rows }: { rows: FeatureComparisonRow[] })`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/PricingFeatureTable.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingFeatureTable } from "./PricingFeatureTable";

describe("PricingFeatureTable", () => {
  it("renders each row's feature name and per-plan values", () => {
    render(
      <PricingFeatureTable
        rows={[
          { feature: "Monthly price", essential: "$39", professional: "$149", enterprise: "$499" },
          { feature: "Phone numbers", essential: "1", professional: "3", enterprise: "20+" },
        ]}
      />,
    );
    expect(screen.getByText("Monthly price")).toBeInTheDocument();
    expect(screen.getByText("$39")).toBeInTheDocument();
    expect(screen.getByText("$149")).toBeInTheDocument();
    expect(screen.getByText("$499")).toBeInTheDocument();
    expect(screen.getByText("Phone numbers")).toBeInTheDocument();
    expect(screen.getByText("20+")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/PricingFeatureTable.test.tsx`
Expected: FAIL — `Cannot find module './PricingFeatureTable'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/PricingFeatureTable.tsx
import type { FeatureComparisonRow } from "@/content/pricing";

export function PricingFeatureTable({ rows }: { rows: FeatureComparisonRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-4 font-semibold text-foreground-secondary">Feature</th>
            <th className="p-4 font-semibold text-foreground-secondary">Essential</th>
            <th className="p-4 font-semibold text-primary">Professional</th>
            <th className="p-4 font-semibold text-foreground-secondary">Enterprise</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature} className="border-b border-border last:border-0">
              <td className="p-4 font-medium text-foreground">{row.feature}</td>
              <td className="p-4 text-foreground-secondary">{row.essential}</td>
              <td className="p-4 text-foreground">{row.professional}</td>
              <td className="p-4 text-foreground-secondary">{row.enterprise}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/PricingFeatureTable.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/PricingFeatureTable.tsx src/components/marketing/PricingFeatureTable.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/PricingFeatureTable.tsx apps/dashboard/src/components/marketing/PricingFeatureTable.test.tsx
git commit -m "feat(marketing): add PricingFeatureTable component"
```

---

### Task 5: Pricing page

**Files:**
- Create: `apps/dashboard/src/app/(marketing)/design-preview/receptionist/pricing/page.tsx`

**Interfaces:**
- Consumes: `PricingTable` (Task 2), `RoiCalculator` (Task 3), `PricingFeatureTable` (Task 4), `PRICING_PLANS`, `ANNUAL_SAVINGS_ROWS`, `FEATURE_COMPARISON_ROWS` from `@/content/pricing` (Task 1); `Button` from `@/components/ui/button`; `next/link`.
- Produces: the page at `/design-preview/receptionist/pricing`.

- [ ] **Step 1: Write the page**

```tsx
// apps/dashboard/src/app/(marketing)/design-preview/receptionist/pricing/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PricingTable } from "@/components/marketing/PricingTable";
import { PricingFeatureTable } from "@/components/marketing/PricingFeatureTable";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";
import { ANNUAL_SAVINGS_ROWS, FEATURE_COMPARISON_ROWS, PRICING_PLANS } from "@/content/pricing";

export const metadata: Metadata = {
  title: "Simple, Honest Pricing — Halla AI",
};

export default function PricingPage() {
  return (
    <div data-brand="receptionist" className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10 lg:px-16">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">Pricing</span>
          <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            Simple, Honest Pricing
          </h1>
          <p className="mt-3 text-foreground-secondary">
            14-day free trial. No credit card required. Cancel anytime.
          </p>
        </div>

        <div className="mt-12">
          <PricingTable plans={PRICING_PLANS} />
        </div>

        <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Save 20% — Annual Billing</h2>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 font-semibold text-foreground-secondary">Plan</th>
                <th className="py-2 font-semibold text-foreground-secondary">Annual</th>
                <th className="py-2 font-semibold text-foreground-secondary">Effective / Month</th>
                <th className="py-2 font-semibold text-foreground-secondary">You Save</th>
              </tr>
            </thead>
            <tbody>
              {ANNUAL_SAVINGS_ROWS.map((row) => (
                <tr key={row.plan} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium text-foreground">{row.plan}</td>
                  <td className="py-2 text-foreground-secondary">{row.annualPrice}</td>
                  <td className="py-2 text-foreground-secondary">{row.effectiveMonthly}</td>
                  <td className="py-2 text-primary">{row.savings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-16">
          <h2 className="mb-6 text-center text-lg font-semibold text-foreground">
            Full Feature Comparison
          </h2>
          <PricingFeatureTable rows={FEATURE_COMPARISON_ROWS} />
        </div>

        <div className="mt-16 rounded-2xl border border-border bg-card p-8">
          <h2 className="mb-2 text-center text-lg font-semibold text-foreground">
            Calculate Your Return
          </h2>
          <p className="mb-8 text-center text-foreground-secondary">
            See exactly how fast Halla AI pays for itself.
          </p>
          <RoiCalculator />
        </div>

        <div className="mt-16 rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-xl font-bold text-foreground">Try Halla AI Risk-Free</h2>
          <p className="mt-3 text-foreground-secondary">
            14-day free trial. No credit card. Cancel anytime.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Start Free Trial</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd apps/dashboard && npx tsc --noEmit && npx eslint "src/app/(marketing)/design-preview/receptionist/pricing/page.tsx" --max-warnings=0`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "apps/dashboard/src/app/(marketing)/design-preview/receptionist/pricing/page.tsx"
git commit -m "feat(marketing): compose pricing page with plan cards, comparison table, and ROI calculator"
```

---

### Task 6: Playwright smoke tests

**Files:**
- Modify: `e2e/journeys/marketing-hero-preview.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect` from `../fixtures` (existing pattern, unchanged).

- [ ] **Step 1: Add two new tests to the existing describe block**

Add after the existing tests (do not remove or modify any existing test):

```ts
  test('pricing page renders all 3 plans and the feature table with no console errors', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist/pricing', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Simple, Honest Pricing' })).toBeVisible();
    await expect(page.getByText('Essential')).toBeVisible();
    await expect(page.getByText('Professional')).toBeVisible();
    await expect(page.getByText('Enterprise')).toBeVisible();
    await expect(page.getByText('Most Popular')).toBeVisible();
    await expect(page.getByText('Full Feature Comparison')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('ROI calculator recomputes when inputs change', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist/pricing', { waitUntil: 'load' });
    await expect(page.getByText('$3,000')).toBeVisible();
    await page.getByLabel('Monthly Calls You Currently Miss').fill('40');
    await expect(page.getByText('$6,000')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests**

Run: `cd "E:\Halla AI" && PLAYWRIGHT_SKIP_GATEWAY=1 npx playwright test e2e/journeys/marketing-hero-preview.spec.ts --project=chromium`
Expected: all tests pass (all pre-existing tests plus these 2 new ones)

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/marketing-hero-preview.spec.ts
git commit -m "test(marketing): add smoke coverage for pricing page and ROI calculator"
```

---

## Self-Review Notes

- **Spec coverage:** delivers the "Pricing" bullet from sub-project 3 (`PricingTable` fed by `content/pricing.ts`, plus `RoiCalculator` as the one interactive client component on the page). The full feature matrix and annual-savings table are additional production content not explicitly named in the spec's one-line bullet but present on the real page being migrated — included as a small dedicated `PricingFeatureTable` component (matrix, reusable shape) and an inline table for the 3-row annual savings data (too small/page-specific to warrant its own component, matching the precedent set by the "why it matters" inline section in sub-project 2's page composition).
- **Placeholder scan:** none — every step has complete, runnable code with real copy/figures transcribed from production.
- **Type consistency:** `PricingPlan`, `AnnualSavingsRow`, `FeatureComparisonRow`, `RoiPlanOption` (Task 1) are each consumed by exactly one downstream component with a matching shape — no cross-brand reuse expected for these types (pricing is receptionist-only, unlike `Faq`/`Accordion` which sub-project 2's and this slice's final reviews both flagged for cross-slice reuse), so no shared `content/types.ts` extraction is needed here per YAGNI.
- **Client/server boundary:** `RoiCalculator` is the only component in this plan requiring `"use client"` — its brief explicitly calls this out per the prior sub-project's final-review finding that a missing directive can silently work by accident and break later. `PricingTable` and `PricingFeatureTable` remain plain Server Components (no local state, no event handlers beyond `Link`/`Button`'s own internal client boundaries).
- **Following prior sub-project's precedent:** ROI calculator inputs use plain `<input>`/`<select>` with Tailwind styling (not the shadcn `Input`/`Select` primitives) since those primitives do not yet exist in `apps/dashboard/src/components/ui/` — introducing them is out of scope for this plan; a future slice needing more form primitives should add them as their own task, not smuggle them into this one.
