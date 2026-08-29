import Link from "next/link";
import { ArrowRight, Settings, Sparkles, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ServiceItem } from "@/content/types";

const ICONS = {
  settings: Settings,
  "trending-up": TrendingUp,
  sparkles: Sparkles,
} as const;

export function FeatureGrid({ items }: { items: ServiceItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <Card
            key={item.title}
            className={cn(
              "flex flex-col",
              item.featured && "border-primary/50 ring-1 ring-primary/30",
            )}
          >
            <CardContent className="flex flex-1 flex-col gap-4 p-6">
              {item.featured && item.featuredBadge && (
                <span className="w-fit rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                  {item.featuredBadge}
                </span>
              )}
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
                <Icon className="size-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                {item.label}
              </span>
              <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
              <p className="text-sm text-foreground-secondary">{item.description}</p>
              <ul className="flex flex-1 flex-col gap-2 text-sm text-foreground-secondary">
                {item.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2">
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={item.href}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Explore {item.exploreLabel} <ArrowRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
