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
