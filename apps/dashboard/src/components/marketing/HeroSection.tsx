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
  /** Optional decorative layer (e.g. a 3D scene) rendered behind the hero
   * content, absolutely positioned and filling the section. When provided,
   * the section itself goes transparent so the layer shows through. */
  background?: React.ReactNode;
};

export function HeroSection({
  eyebrow,
  headline,
  subcopy,
  ctas,
  align = "left",
  children,
  background,
}: HeroSectionProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden px-6 py-24 text-foreground sm:px-10 lg:px-16",
        background ? "bg-transparent" : "bg-background",
        align === "center" && "text-center",
      )}
    >
      {background && <div className="pointer-events-none absolute inset-0">{background}</div>}
      <div
        className={cn(
          "relative z-10 mx-auto flex max-w-3xl flex-col gap-6",
          align === "center" && "items-center",
        )}
      >
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
