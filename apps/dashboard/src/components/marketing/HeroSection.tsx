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
