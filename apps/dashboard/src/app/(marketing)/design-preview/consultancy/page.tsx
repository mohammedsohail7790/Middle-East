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
