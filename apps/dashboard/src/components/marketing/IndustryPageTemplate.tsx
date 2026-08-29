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
