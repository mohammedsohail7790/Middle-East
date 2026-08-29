import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { HeroCta } from "@/components/marketing/HeroSection";

export function CtaBanner({
  eyebrow,
  headline,
  subcopy,
  ctas,
}: {
  eyebrow: string;
  headline: string;
  subcopy: string;
  ctas: HeroCta[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center sm:px-12">
      <span className="inline-flex w-fit items-center rounded-full bg-primary/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        {eyebrow}
      </span>
      <h2 className="mx-auto mt-4 max-w-2xl text-2xl font-bold text-foreground sm:text-3xl">
        {headline}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-foreground-secondary">{subcopy}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {ctas.map((cta) => (
          <Button key={cta.label} asChild variant={cta.variant ?? "default"} size="lg">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
