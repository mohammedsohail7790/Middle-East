"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  type FeatureKey,
  isFeatureLocked,
} from "@/lib/plan-features";
import { subscribePlanUpdates } from "@/lib/store";
import { PlanUpgradeGate } from "@/components/billing/PlanUpgradeGate";

/** Renders children when the tenant plan includes the feature; otherwise shows upgrade CTA. */
export function PlanFeatureGate({
  feature,
  title,
  children,
}: {
  feature: FeatureKey;
  title?: string;
  children: ReactNode;
}) {
  const [locked, setLocked] = useState(() => isFeatureLocked(feature));

  useEffect(() => {
    const sync = () => setLocked(isFeatureLocked(feature));
    sync();
    return subscribePlanUpdates(sync);
  }, [feature]);

  if (locked) {
    return <PlanUpgradeGate feature={feature} title={title} />;
  }

  return <>{children}</>;
}
