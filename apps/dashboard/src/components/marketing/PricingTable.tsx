import Link from "next/link";
import { Check, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PricingPlan } from "@/content/pricing";

export function PricingTable({ plans }: { plans: PricingPlan[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {plans.map((plan) => (
        <Card
          key={plan.id}
          className={cn("relative flex flex-col", plan.popular && "border-primary ring-1 ring-primary")}
        >
          {plan.popular && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              Most Popular
            </span>
          )}
          <CardContent className="flex flex-1 flex-col p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground-secondary">
              {plan.name}
            </h3>
            <p className="mt-2 text-3xl font-bold text-foreground">
              ${plan.price}
              <span className="text-base font-medium text-foreground-secondary">{plan.priceSuffix}</span>
            </p>
            <p className="mt-1 text-xs text-foreground-secondary">{plan.minutesLabel}</p>

            <Button asChild variant={plan.ctaVariant} className="mt-6 w-full">
              <Link href="/signup">{plan.ctaLabel}</Link>
            </Button>

            <div className="mt-6 flex flex-col gap-2">
              {plan.features.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {feature}
                </div>
              ))}
              {plan.missingFeatures.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-2 text-sm text-foreground-secondary opacity-60"
                >
                  <X className="mt-0.5 size-4 shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
