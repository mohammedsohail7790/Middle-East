"use client";

import { HeroParticleCanvas } from "@/components/marketing/premium/HeroParticleCanvas";

type Variant = "marketing" | "auth";

export function MarketingAtmosphere({ variant = "marketing" }: { variant?: Variant }) {
  return (
    <div className={`mkt-atmosphere mkt-atmosphere--${variant}`} aria-hidden>
      <div className="mkt-atmosphere__grid" />
      <div className="mkt-atmosphere__orb mkt-atmosphere__orb--1" />
      <div className="mkt-atmosphere__orb mkt-atmosphere__orb--2" />
      <div className="mkt-atmosphere__orb mkt-atmosphere__orb--3" />
      {variant === "auth" && <HeroParticleCanvas className="mkt-atmosphere__particles" />}
    </div>
  );
}
