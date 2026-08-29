# Receptionist Industries Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Industries" section of the AI Receptionist product site as a templated set of pages — one detail page per industry rendered from data, plus an index page — inside the existing Next.js App Router marketing rebuild.

**Architecture:** A typed `content/industries.ts` data file feeds a single `IndustryPageTemplate` component rendered by a dynamic route (`industries/[industry]/page.tsx`), so adding a future industry never requires new component code. A new shadcn-style `Accordion` UI primitive (wrapping the already-installed `@radix-ui/react-accordion`) backs a `FaqAccordion` marketing composite, reused by every industry detail page and available for the later FAQ-page slice. Routes are added under the existing `/design-preview/receptionist` preview tree (the same non-production-cutover convention established in sub-projects 1 and 2 — the real `/[locale]/*` route tree migration is a separate, later decision per the design spec).

**Tech Stack:** Next.js App Router, TypeScript, Tailwind (existing design tokens + `data-brand="receptionist"`), `@radix-ui/react-accordion`, Vitest + React Testing Library, Playwright.

## Global Constraints

- No 3D visualization, canvas, or `@react-three/fiber` usage anywhere in these pages.
- Tailwind utility classes and existing design-token CSS custom properties only (`--background`, `--foreground`, `--foreground-secondary`, `--primary`, `--primary-foreground`, `--accent`, `--border`, `--card`, `--card-foreground`, `--muted`, `--muted-foreground` — all already defined under `[data-brand="receptionist"]` in `globals.css`). No hand-written custom breakpoints — use Tailwind's `sm:`/`md:`/`lg:` prefixes only.
- TypeScript strict; no `any`.
- Keep files under 500 lines.
- Content only — no fabricated industries or FAQ copy. Only the 6 industries with real production content (HVAC, Plumbing, Electrical, Landscaping, Home Cleaning, Legal Firms) get detail pages. The index page's other category cards (Property Management, Salons & Spas, Auto Repair, Veterinary, Education) are recreated as static, non-clickable cards exactly matching production's current placeholder behavior (`Marketing site/halla_main.js` lines 248-271) — they do not get a template-driven detail page in this sub-project.
- Follow shadcn/ui-style patterns already established in this repo: `React.forwardRef` + `displayName` for `ui/` primitives, `cva` only where variants exist, `cn()` from `@/lib/utils`, plain function components for marketing composites.

---

### Task 1: `content/industries.ts` content data

**Files:**
- Create: `apps/dashboard/src/content/industries.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type IndustryFaq = { question: string; answer: string }`; `type Industry = { slug: string; name: string; tagline: string; description: string; faqs: IndustryFaq[] }`; `INDUSTRIES: Industry[]` (6 entries); `type PlaceholderCategory = { heading: string; items: { label: string; description: string }[] }`; `PLACEHOLDER_CATEGORIES: PlaceholderCategory[]`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/dashboard/src/content/industries.test.ts
import { describe, expect, it } from "vitest";
import { INDUSTRIES, PLACEHOLDER_CATEGORIES } from "./industries";

describe("industries content", () => {
  it("has exactly 6 industries with slugs matching production data", () => {
    const slugs = INDUSTRIES.map((i) => i.slug).sort();
    expect(slugs).toEqual(
      ["cleaning", "electrical", "hvac", "landscaping", "legal", "plumbing"].sort(),
    );
  });

  it("every industry has at least one FAQ", () => {
    expect(INDUSTRIES.every((i) => i.faqs.length > 0)).toBe(true);
  });

  it("has 3 placeholder categories for the index page's non-detail cards", () => {
    expect(PLACEHOLDER_CATEGORIES).toHaveLength(3);
    expect(PLACEHOLDER_CATEGORIES.flatMap((c) => c.items).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/content/industries.test.ts`
Expected: FAIL — `Cannot find module './industries'`

- [ ] **Step 3: Write the implementation**

Content transcribed verbatim from `Marketing site/halla_main.js` lines 234-271 (the `INDS` object and the `loadInd('all')` static category markup).

```ts
// apps/dashboard/src/content/industries.ts
export type IndustryFaq = { question: string; answer: string };

export type Industry = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  faqs: IndustryFaq[];
};

export const INDUSTRIES: Industry[] = [
  {
    slug: "hvac",
    name: "HVAC",
    tagline: "Keep Your Schedule Hot. Not Your Customers.",
    description:
      "Halla AI dispatches HVAC technicians 24/7 — handling no-heat emergencies in winter, no-AC calls in summer, and maintenance bookings all year round while you're in an attic or under a house.",
    faqs: [
      {
        question: "How does Halla AI handle seasonal demand spikes?",
        answer:
          "The AI scales automatically. During heat waves or cold snaps, it handles hundreds of simultaneous calls without busy signals. You define priority rules — AI follows them consistently.",
      },
      {
        question: "Can the AI diagnose basic HVAC problems?",
        answer:
          "Yes. It guides homeowners through basic troubleshooting (thermostat batteries, resetting breakers, changing filters). If not resolved, it escalates for dispatch.",
      },
      {
        question: "How does Halla AI handle carbon monoxide concerns?",
        answer:
          "CO-related calls are flagged as highest priority. The AI instructs the homeowner to evacuate and call the fire department, then immediately alerts your team.",
      },
    ],
  },
  {
    slug: "plumbing",
    name: "Plumbing",
    tagline: "Stop Leaks. Not Leads.",
    description:
      "Captures emergency details, books service windows, and sends job summaries instantly to your phone when you're knee-deep in a flooded basement — burst pipes, clogged drains, water heaters, and routine maintenance.",
    faqs: [
      {
        question: "How does Halla AI handle after-hours emergency calls?",
        answer:
          "You define what's an emergency. The AI collects details and immediately notifies your on-call plumber via text with the full job summary.",
      },
      {
        question: "Can the AI provide estimates over the phone?",
        answer:
          "Yes — service call fees, hourly rates, and common flat-rate pricing. For complex estimates, it collects details and schedules an on-site assessment.",
      },
      {
        question: "What if a customer has a gas line concern?",
        answer:
          "Gas-related calls are flagged as highest priority with immediate team notification and instructions to evacuate and call the gas company.",
      },
    ],
  },
  {
    slug: "electrical",
    name: "Electrical",
    tagline: "Power Your Business Growth.",
    description:
      "Captures emergency details when you're up to your elbows in a panel. Handles questions about service areas, hourly rates, availability, and routes emergency calls instantly.",
    faqs: [
      {
        question: "How does Halla AI handle electrical emergencies?",
        answer:
          "You define emergency criteria. The AI collects details and immediately notifies your on-call electrician via text with the full job summary.",
      },
      {
        question: "Can the AI provide estimates?",
        answer:
          "Service call fees and hourly rates yes. For full estimates, it schedules an on-site assessment.",
      },
      {
        question: "What if a caller describes something the AI doesn't understand?",
        answer:
          "The AI collects the description verbatim, flags for review, and promises a callback. No technical diagnosis attempted.",
      },
    ],
  },
  {
    slug: "landscaping",
    name: "Landscaping",
    tagline: "Grow Your Business. Never Miss a Spring Call.",
    description:
      "Captures property details, books estimates, and handles mowing schedules, fertilization programs, tree services, and snow removal bookings while you're on a zero-turn or trimming hedges.",
    faqs: [
      {
        question: "Can the AI handle different service frequencies?",
        answer:
          "Yes. Weekly, bi-weekly, monthly, or one-time. Recurring services booked automatically.",
      },
      {
        question: "Can the AI provide mowing quotes?",
        answer:
          "Yes, based on property size using your standard rate. Complex properties require an on-site estimate.",
      },
      {
        question: "How does the AI handle emergency tree removal?",
        answer:
          "Storm-damaged tree calls are dispatched immediately. AI captures tree details and schedules an arborist visit.",
      },
    ],
  },
  {
    slug: "cleaning",
    name: "Home Cleaning",
    tagline: "Clean More Homes. Never Miss a Quote.",
    description:
      "Captures property details, books estimates and recurring services for standard, deep, move-out, and commercial cleaning while you're driving between jobs.",
    faqs: [
      {
        question: "Can the AI provide quotes over the phone?",
        answer:
          "For standard recurring cleans, yes — firm pricing based on bedroom/bathroom count. For deep or move-out cleans, a virtual or in-person estimate is needed.",
      },
      {
        question: "How does Halla AI handle recurring scheduling?",
        answer:
          "Sets up weekly, bi-weekly, or monthly recurring appointments based on route availability. Confirmed via SMS and email.",
      },
      {
        question: "What if a customer needs to skip a week?",
        answer:
          "The AI reschedules single occurrences or modifies the recurring pattern based on your rescheduling policy.",
      },
    ],
  },
  {
    slug: "legal",
    name: "Legal Firms",
    tagline: "Never Miss a Billable Consultation Call.",
    description:
      "Captures potential client details, books initial consultations, and logs intake into your practice management system while you're in court, drafting documents, or meeting with existing clients.",
    faqs: [
      {
        question: "How does Halla AI handle attorney-client confidentiality?",
        answer:
          "All calls processed through encrypted systems. Transcripts stored securely. The AI never shares client info with third parties.",
      },
      {
        question: "Can the AI screen for conflicts of interest?",
        answer:
          "Yes. You provide conflict check questions. The AI collects this during intake and flags potential conflicts before scheduling.",
      },
      {
        question: "Can the AI handle different practice areas?",
        answer:
          "Yes. Separate intake flows per practice area — different questions for PI vs. estate planning vs. criminal defense.",
      },
    ],
  },
];

export type PlaceholderCategory = {
  heading: string;
  items: { label: string; description: string }[];
};

export const PLACEHOLDER_CATEGORIES: PlaceholderCategory[] = [
  {
    heading: "Property & Professional Services",
    items: [
      {
        label: "Property Management",
        description: "Maintenance requests, tenant calls, emergency routing",
      },
    ],
  },
  {
    heading: "Beauty & Automotive",
    items: [
      { label: "Salons & Spas", description: "Booking, pricing, availability" },
      { label: "Auto Repair", description: "Service appointments, estimates" },
    ],
  },
  {
    heading: "Other Services",
    items: [
      { label: "Veterinary", description: "Appointments, emergency triage" },
      { label: "Education", description: "Enrollment, tuition, scheduling" },
    ],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/content/industries.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/content/industries.ts src/content/industries.test.ts --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/content/industries.ts apps/dashboard/src/content/industries.test.ts
git commit -m "feat(marketing): add industries content data"
```

---

### Task 2: `Accordion` UI primitive

**Files:**
- Create: `apps/dashboard/src/components/ui/accordion.tsx`
- Test: `apps/dashboard/src/components/ui/accordion.test.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-accordion` (already an installed dependency); `cn` from `@/lib/utils`; `ChevronDown` from `lucide-react`.
- Produces: `Accordion` (re-export of `AccordionPrimitive.Root`, `type="single"` `collapsible` usage left to the caller), `AccordionItem`, `AccordionTrigger`, `AccordionContent` — the standard shadcn/ui accordion primitive set, each `React.forwardRef` with `displayName`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/ui/accordion.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

describe("Accordion", () => {
  it("expands an item's content when its trigger is clicked", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question one</AccordionTrigger>
          <AccordionContent>Answer one</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.queryByText("Answer one")).not.toBeVisible();
    fireEvent.click(screen.getByText("Question one"));
    expect(screen.getByText("Answer one")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/ui/accordion.test.tsx`
Expected: FAIL — `Cannot find module './accordion'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/ui/accordion.tsx
import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item ref={ref} className={cn("border-b border-border", className)} {...props} />
));
AccordionItem.displayName = AccordionPrimitive.Item.displayName;

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 items-center justify-between py-4 text-left text-sm font-medium text-foreground transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 shrink-0 text-foreground-secondary transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm text-foreground-secondary data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4 pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
```

Note: this uses the standard shadcn/ui `accordion-up`/`accordion-down` keyframe names. If `tailwind.config.ts` does not already define them (check `apps/dashboard/tailwind.config.ts` for an existing `keyframes`/`animation` block before writing this step), add them:

```ts
// apps/dashboard/tailwind.config.ts — inside theme.extend
keyframes: {
  "accordion-down": {
    from: { height: "0" },
    to: { height: "var(--radix-accordion-content-height)" },
  },
  "accordion-up": {
    from: { height: "var(--radix-accordion-content-height)" },
    to: { height: "0" },
  },
},
animation: {
  "accordion-down": "accordion-down 0.2s ease-out",
  "accordion-up": "accordion-up 0.2s ease-out",
},
```

Merge these into the existing `keyframes`/`animation` objects if they're already present — do not create a second `theme.extend` block.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/ui/accordion.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/ui/accordion.tsx src/components/ui/accordion.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/ui/accordion.tsx apps/dashboard/src/components/ui/accordion.test.tsx apps/dashboard/tailwind.config.ts
git commit -m "feat(ui): add Accordion primitive"
```

---

### Task 3: `FaqAccordion` marketing composite

**Files:**
- Create: `apps/dashboard/src/components/marketing/FaqAccordion.tsx`
- Test: `apps/dashboard/src/components/marketing/FaqAccordion.test.tsx`

**Interfaces:**
- Consumes: `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` from `@/components/ui/accordion` (Task 2); `type IndustryFaq` from `@/content/industries` (Task 1) — reused generically as the FAQ shape (`{ question, answer }`) so the later standalone FAQ-page slice can reuse this same component with its own content array without a type mismatch.
- Produces: `FaqAccordion({ items }: { items: IndustryFaq[] })`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/FaqAccordion.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaqAccordion } from "./FaqAccordion";

describe("FaqAccordion", () => {
  it("renders each question and reveals its answer on click", () => {
    render(
      <FaqAccordion
        items={[
          { question: "How does it work?", answer: "It just does." },
          { question: "Is it secure?", answer: "Yes, encrypted end to end." },
        ]}
      />,
    );
    expect(screen.getByText("How does it work?")).toBeInTheDocument();
    expect(screen.getByText("Is it secure?")).toBeInTheDocument();
    expect(screen.queryByText("It just does.")).not.toBeVisible();
    fireEvent.click(screen.getByText("How does it work?"));
    expect(screen.getByText("It just does.")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/FaqAccordion.test.tsx`
Expected: FAIL — `Cannot find module './FaqAccordion'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/FaqAccordion.tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { IndustryFaq } from "@/content/industries";

export function FaqAccordion({ items }: { items: IndustryFaq[] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {items.map((item) => (
        <AccordionItem key={item.question} value={item.question}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/FaqAccordion.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/FaqAccordion.tsx src/components/marketing/FaqAccordion.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/FaqAccordion.tsx apps/dashboard/src/components/marketing/FaqAccordion.test.tsx
git commit -m "feat(marketing): add FaqAccordion component"
```

---

### Task 4: `IndustryPageTemplate` component

**Files:**
- Create: `apps/dashboard/src/components/marketing/IndustryPageTemplate.tsx`
- Test: `apps/dashboard/src/components/marketing/IndustryPageTemplate.test.tsx`

**Interfaces:**
- Consumes: `type Industry`, `INDUSTRIES` from `@/content/industries` (Task 1); `FaqAccordion` from `@/components/marketing/FaqAccordion` (Task 3); `Button` from `@/components/ui/button`; `next/link`.
- Produces: `IndustryPageTemplate({ industry }: { industry: Industry })`. Renders the industry's tagline/description/feature list/CTAs, its FAQ accordion, and a list of links to the other 5 industries (matching production's "Other Industries" pill list).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/IndustryPageTemplate.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndustryPageTemplate } from "./IndustryPageTemplate";
import { INDUSTRIES } from "@/content/industries";

describe("IndustryPageTemplate", () => {
  const hvac = INDUSTRIES.find((i) => i.slug === "hvac")!;

  it("renders the industry's tagline, description, and FAQ questions", () => {
    render(<IndustryPageTemplate industry={hvac} />);
    expect(screen.getByRole("heading", { name: /Halla AI for HVAC/i })).toBeInTheDocument();
    expect(screen.getByText(hvac.tagline)).toBeInTheDocument();
    expect(screen.getByText(hvac.description)).toBeInTheDocument();
    expect(screen.getByText(hvac.faqs[0].question)).toBeInTheDocument();
  });

  it("links to every other industry, not itself", () => {
    render(<IndustryPageTemplate industry={hvac} />);
    expect(screen.queryByRole("link", { name: "HVAC" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plumbing" })).toHaveAttribute(
      "href",
      "/design-preview/receptionist/industries/plumbing",
    );
  });

  it("has a primary CTA linking to signup", () => {
    render(<IndustryPageTemplate industry={hvac} />);
    expect(screen.getByRole("link", { name: "Start Free Trial" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/IndustryPageTemplate.test.tsx`
Expected: FAIL — `Cannot find module './IndustryPageTemplate'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/IndustryPageTemplate.tsx
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { INDUSTRIES, type Industry } from "@/content/industries";

const CAPABILITIES = [
  "Answers every call 24/7 — even during jobs",
  "Custom intake questions for your service type",
  "Emergency triage and immediate team alerts",
  "Appointment booking and calendar sync",
  "Lead qualification and CRM auto-entry",
  "Bilingual English + Spanish support",
];

export function IndustryPageTemplate({ industry }: { industry: Industry }) {
  const otherIndustries = INDUSTRIES.filter((i) => i.slug !== industry.slug);

  return (
    <div className="mx-auto grid max-w-5xl gap-16 px-6 py-16 sm:px-10 lg:grid-cols-2 lg:px-16">
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {industry.tagline}
        </span>
        <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
          Halla AI for {industry.name}
        </h1>
        <p className="mt-4 text-foreground-secondary">{industry.description}</p>

        <h2 className="mt-8 text-lg font-semibold text-foreground">
          What Halla AI Does for {industry.name}
        </h2>
        <ul className="mt-4 flex flex-col gap-2">
          {CAPABILITIES.map((capability) => (
            <li key={capability} className="flex items-start gap-2 text-sm text-foreground-secondary">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              {capability}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/signup">Start Free Trial</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/pricing">View Pricing</Link>
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground">Frequently Asked Questions</h2>
        <div className="mt-4">
          <FaqAccordion items={industry.faqs} />
        </div>

        <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          Other Industries
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {otherIndustries.map((other) => (
            <Link
              key={other.slug}
              href={`/design-preview/receptionist/industries/${other.slug}`}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground-secondary hover:text-foreground"
            >
              {other.name}
            </Link>
          ))}
          <Link
            href="/design-preview/receptionist/industries"
            className="rounded-full border border-border px-3 py-1.5 text-sm text-primary"
          >
            + See All
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/IndustryPageTemplate.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/IndustryPageTemplate.tsx src/components/marketing/IndustryPageTemplate.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/IndustryPageTemplate.tsx apps/dashboard/src/components/marketing/IndustryPageTemplate.test.tsx
git commit -m "feat(marketing): add IndustryPageTemplate component"
```

---

### Task 5: `IndustriesIndexGrid` component

**Files:**
- Create: `apps/dashboard/src/components/marketing/IndustriesIndexGrid.tsx`
- Test: `apps/dashboard/src/components/marketing/IndustriesIndexGrid.test.tsx`

**Interfaces:**
- Consumes: `INDUSTRIES`, `PLACEHOLDER_CATEGORIES` from `@/content/industries` (Task 1); `next/link`.
- Produces: `IndustriesIndexGrid()` (no props — reads the content module directly, since this grid is not reused with different content anywhere else in the app, unlike the per-industry template).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/marketing/IndustriesIndexGrid.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndustriesIndexGrid } from "./IndustriesIndexGrid";

describe("IndustriesIndexGrid", () => {
  it("links each real industry to its detail page", () => {
    render(<IndustriesIndexGrid />);
    expect(screen.getByRole("link", { name: /HVAC/ })).toHaveAttribute(
      "href",
      "/design-preview/receptionist/industries/hvac",
    );
  });

  it("renders placeholder categories as non-interactive cards", () => {
    render(<IndustriesIndexGrid />);
    expect(screen.getByText("Property Management")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Property Management/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/IndustriesIndexGrid.test.tsx`
Expected: FAIL — `Cannot find module './IndustriesIndexGrid'`

- [ ] **Step 3: Write the implementation**

```tsx
// apps/dashboard/src/components/marketing/IndustriesIndexGrid.tsx
import Link from "next/link";

import { INDUSTRIES, PLACEHOLDER_CATEGORIES } from "@/content/industries";

export function IndustriesIndexGrid() {
  return (
    <div className="flex flex-col gap-12">
      <div>
        <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          Trades & Services
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {INDUSTRIES.map((industry) => (
            <Link
              key={industry.slug}
              href={`/design-preview/receptionist/industries/${industry.slug}`}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
            >
              <h4 className="text-sm font-semibold text-foreground">{industry.name}</h4>
              <p className="mt-1 text-xs text-foreground-secondary">{industry.tagline}</p>
            </Link>
          ))}
        </div>
      </div>

      {PLACEHOLDER_CATEGORIES.map((category) => (
        <div key={category.heading}>
          <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
            {category.heading}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {category.items.map((item) => (
              <div key={item.label} className="rounded-xl border border-border p-4 opacity-70">
                <h4 className="text-sm font-semibold text-foreground">{item.label}</h4>
                <p className="mt-1 text-xs text-foreground-secondary">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run src/components/marketing/IndustriesIndexGrid.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `cd apps/dashboard && npx eslint src/components/marketing/IndustriesIndexGrid.tsx src/components/marketing/IndustriesIndexGrid.test.tsx --max-warnings=0 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/marketing/IndustriesIndexGrid.tsx apps/dashboard/src/components/marketing/IndustriesIndexGrid.test.tsx
git commit -m "feat(marketing): add IndustriesIndexGrid component"
```

---

### Task 6: Industries index route

**Files:**
- Create: `apps/dashboard/src/app/(marketing)/design-preview/receptionist/industries/page.tsx`

**Interfaces:**
- Consumes: `IndustriesIndexGrid` from `@/components/marketing/IndustriesIndexGrid` (Task 5).
- Produces: the page at `/design-preview/receptionist/industries`.

- [ ] **Step 1: Write the page**

```tsx
// apps/dashboard/src/app/(marketing)/design-preview/receptionist/industries/page.tsx
import type { Metadata } from "next";

import { IndustriesIndexGrid } from "@/components/marketing/IndustriesIndexGrid";

export const metadata: Metadata = {
  title: "Industries We Serve — Halla AI",
};

export default function IndustriesIndexPage() {
  return (
    <div data-brand="receptionist" className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10 lg:px-16">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          Industries
        </span>
        <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
          Industries We Serve
        </h1>
        <p className="mt-3 max-w-xl text-foreground-secondary">
          50+ industries. Pre-configured. Ready in minutes.
        </p>
        <div className="mt-12">
          <IndustriesIndexGrid />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd apps/dashboard && npx tsc --noEmit && npx eslint "src/app/(marketing)/design-preview/receptionist/industries/page.tsx" --max-warnings=0`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "apps/dashboard/src/app/(marketing)/design-preview/receptionist/industries/page.tsx"
git commit -m "feat(marketing): add industries index page"
```

---

### Task 7: Industry detail dynamic route

**Files:**
- Create: `apps/dashboard/src/app/(marketing)/design-preview/receptionist/industries/[industry]/page.tsx`

**Interfaces:**
- Consumes: `INDUSTRIES` from `@/content/industries` (Task 1); `IndustryPageTemplate` from `@/components/marketing/IndustryPageTemplate` (Task 4); `notFound` from `next/navigation`.
- Produces: the pages at `/design-preview/receptionist/industries/{hvac,plumbing,electrical,landscaping,cleaning,legal}`.

- [ ] **Step 1: Write the page**

```tsx
// apps/dashboard/src/app/(marketing)/design-preview/receptionist/industries/[industry]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IndustryPageTemplate } from "@/components/marketing/IndustryPageTemplate";
import { INDUSTRIES } from "@/content/industries";

export function generateStaticParams() {
  return INDUSTRIES.map((industry) => ({ industry: industry.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { industry: string };
}): Metadata {
  const industry = INDUSTRIES.find((i) => i.slug === params.industry);
  return { title: industry ? `Halla AI for ${industry.name}` : "Industry Not Found" };
}

export default function IndustryDetailPage({ params }: { params: { industry: string } }) {
  const industry = INDUSTRIES.find((i) => i.slug === params.industry);
  if (!industry) {
    notFound();
  }

  return (
    <div data-brand="receptionist" className="min-h-screen bg-background">
      <IndustryPageTemplate industry={industry} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd apps/dashboard && npx tsc --noEmit && npx eslint "src/app/(marketing)/design-preview/receptionist/industries/[industry]/page.tsx" --max-warnings=0`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "apps/dashboard/src/app/(marketing)/design-preview/receptionist/industries/[industry]/page.tsx"
git commit -m "feat(marketing): add industry detail dynamic route"
```

---

### Task 8: Playwright smoke tests

**Files:**
- Modify: `e2e/journeys/marketing-hero-preview.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect` from `../fixtures` (existing pattern, unchanged).

- [ ] **Step 1: Add two new tests to the existing describe block**

Add after the existing tests (do not remove or modify any existing test):

```ts
  test('industries index page lists all 6 industries with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist/industries', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Industries We Serve' })).toBeVisible();
    for (const name of ['HVAC', 'Plumbing', 'Electrical', 'Landscaping', 'Home Cleaning', 'Legal Firms']) {
      await expect(page.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
    }
    await expect(page.getByText('Property Management')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('HVAC industry detail page renders content and FAQ with no console errors', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist/industries/hvac', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Halla AI for HVAC' })).toBeVisible();
    await expect(page.getByText('Keep Your Schedule Hot. Not Your Customers.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start Free Trial' })).toHaveAttribute('href', '/signup');
    const firstFaq = page.getByText('How does Halla AI handle seasonal demand spikes?');
    await expect(firstFaq).toBeVisible();
    await firstFaq.click();
    await expect(page.getByText(/The AI scales automatically/)).toBeVisible();
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
git commit -m "test(marketing): add smoke coverage for industries pages"
```

---

## Self-Review Notes

- **Spec coverage:** delivers the "Industries" bullet from sub-project 3 (`IndustryPageTemplate` + `content/industries.ts`, dynamic route, index grid). Content is intentionally scoped to the 6 industries with real production copy per the user's explicit decision — the other placeholder categories are recreated as static cards, matching production's actual current behavior rather than the aspirational "27/50+ industries" marketing copy.
- **Placeholder scan:** none — every step has complete, runnable code with real copy transcribed from `Marketing site/halla_main.js`.
- **Type consistency:** `IndustryFaq` (Task 1) is reused as-is by `FaqAccordion` (Task 3) rather than a redefined shape, so a later standalone FAQ-page slice can reuse `FaqAccordion` with any `{ question, answer }[]` array. `Industry` (Task 1) is consumed by exactly `IndustryPageTemplate` (Task 4) with a matching shape.
- **Following sub-project 2's precedent:** this plan reuses the established `content/types.ts` lesson from sub-project 2's final review by keeping `Industry`/`IndustryFaq`/`PlaceholderCategory` type definitions colocated with their sole content file for now — since, unlike `ServiceItem`, nothing outside the receptionist brand is expected to import `Industry`. If a later sub-project needs to share this shape across brands, extract at that time (YAGNI).
