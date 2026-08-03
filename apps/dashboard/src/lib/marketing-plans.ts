import type { GatewayPlan } from "@/lib/public-api";
import { PRICING_PLANS_FULL } from "@/lib/marketing-pages";

export type PricingCardPlan = (typeof PRICING_PLANS_FULL)[number];

const PLAN_ORDER = ["essential", "professional"] as const;

/** Merge live gateway prices with static marketing feature bullets. */
export function mergePlansWithGateway(
  gateway: Record<string, GatewayPlan> | null
): PricingCardPlan[] {
  return PLAN_ORDER.map((id) => {
    const staticPlan = PRICING_PLANS_FULL.find((p) => p.id === id);
    const live = gateway?.[id];
    if (!staticPlan) {
      throw new Error(`Missing static plan ${id}`);
    }
    if (!live) return staticPlan;
    return {
      ...staticPlan,
      name: live.name || staticPlan.name,
      price: live.price ?? staticPlan.price,
      mins: `${live.includedMinutes} min · $${live.overageRate.toFixed(2)}/min overage`,
      popular: live.badge === "Most Popular" || staticPlan.popular,
    };
  });
}
