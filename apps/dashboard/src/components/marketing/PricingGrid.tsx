"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchPublicPlans, type GatewayPlan } from "@/lib/public-api";
import { mergePlansWithGateway, type PricingCardPlan } from "@/lib/marketing-plans";
import { PRICING_PLANS_FULL } from "@/lib/marketing-pages";

export function PricingGrid({
  compact,
  initialPlans,
}: {
  compact?: boolean;
  initialPlans?: Record<string, GatewayPlan> | null;
}) {
  const [plans, setPlans] = useState<PricingCardPlan[]>(() =>
    mergePlansWithGateway(initialPlans ?? null)
  );

  useEffect(() => {
    if (initialPlans) return;
    let cancelled = false;
    fetchPublicPlans()
      .then((data) => {
        if (!cancelled) setPlans(mergePlansWithGateway(data));
      })
      .catch(() => {
        if (!cancelled) setPlans(PRICING_PLANS_FULL);
      });
    return () => {
      cancelled = true;
    };
  }, [initialPlans]);

  const gridClass = plans.length <= 2 ? "grid-2" : plans.length >= 4 ? "grid-4" : "grid-3";
  const maxWidth = plans.length <= 2 ? (compact ? 680 : 720) : compact ? 920 : 960;

  return (
    <div
      className={gridClass}
      style={{ maxWidth, margin: "0 auto", alignItems: "start" }}
    >
      {plans.map((p) => (
        <div key={p.id} className={`pricing-card${p.popular ? " popular" : ""}`}>
          {p.popular && <div className="pop-badge">Most Popular</div>}
          <div className="pricing-plan">{p.name}</div>
          <div className="pricing-price">
            <sup>$</sup>
            {p.price}
            <sub>/mo</sub>
          </div>
          <div className="pricing-mins">{p.mins}</div>
          <Link
            href="/signup"
            className={`btn ${p.ctaClass}`}
            style={{ width: "100%", marginBottom: 22, display: "flex" }}
          >
            {p.cta}
          </Link>
          <div className="p-divider" />
          {p.features.map((f) => (
            <div key={f.text} className={`pricing-feature${f.ok ? "" : " miss"}`}>
              {f.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
