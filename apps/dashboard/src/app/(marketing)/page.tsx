import type { Metadata } from "next";

import { HeroSection } from "@/components/marketing/HeroSection";
import { StatBar, type Stat } from "@/components/marketing/StatBar";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { StepList } from "@/components/marketing/StepList";
import { ComparisonTable } from "@/components/marketing/ComparisonTable";
import { CtaBanner } from "@/components/marketing/CtaBanner";
import { SiteFooter } from "@/components/marketing/layout/SiteFooter";
import { Marquee } from "@/components/magic-ui/marquee";
import { ConsultancyHeroScene } from "@/components/marketing/premium/consultancy-intelligence/ConsultancyHeroScene";
import { CAPABILITIES, SERVICES, HOW_WE_WORK_STEPS, COMPARISON_ROWS } from "@/content/consultancy";

export const metadata: Metadata = {
  title: "Halla AI – AI Consultancy & Pure AI Receptionist",
  description:
    "Halla AI Consultancy installs connected automation for small businesses. Plus a 24/7 AI receptionist that answers every call — starting at $39/month.",
  openGraph: {
    title: "Halla AI – Never Miss a Call",
    description:
      "Every call answered in under 2 seconds. Books appointments, captures leads, blocks spam.",
    type: "website",
    images: [{ url: "/logo.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Halla AI – Never Miss a Call",
    description:
      "Every call answered in under 2 seconds. Books appointments, captures leads, blocks spam.",
  },
};

const STATS: Stat[] = [
  { value: "20", label: "hours/week reclaimed" },
  { value: "3", label: "connected systems" },
  { value: "1st", label: "responder wins the lead", accent: true },
];

export default function HomePage() {
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
          { label: "See the AI Receptionist", href: "/home", variant: "outline" },
        ]}
        background={<ConsultancyHeroScene />}
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
              { label: "See the AI Receptionist", href: "/home", variant: "outline" },
            ]}
          />
        </div>
      </section>

      <SiteFooter brand="consultancy" />
    </div>
  );
}
