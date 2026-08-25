/**
 * Central plan / feature gating for the dashboard UI.
 * Backend enforcement lives in apps/gateway billing + plan-gating middleware.
 *
 * Naming map: UI `analytics` ↔ billing `advancedAnalytics` ↔ DB flag `advanced_analytics`.
 */

import { getPlan, hasAccess, isNavItemLocked, normalizePlanId } from "@/lib/store";
import type { NavPlan } from "@/lib/dashboard-nav";

export type PlanTier = "trial" | "essential" | "professional";

export type FeatureKey =
  | "analytics"
  | "quality"
  | "customVoice"
  | "integrationsProfessional"
  | "outbound"
  | "campaigns";

const FEATURE_MIN_PLAN: Record<FeatureKey, NavPlan | "trial"> = {
  analytics: "professional",
  quality: "professional",
  customVoice: "professional",
  integrationsProfessional: "professional",
  outbound: "essential",
  campaigns: "essential",
};

const PLAN_LABEL: Record<string, string> = {
  essential: "Starter",
  professional: "Professional",
};

export function currentPlanTier(): PlanTier {
  return normalizePlanId(getPlan()) as PlanTier;
}

export function featureRequiresPlan(feature: FeatureKey): NavPlan | undefined {
  const min = FEATURE_MIN_PLAN[feature];
  if (!min || min === "trial") return undefined;
  return min;
}

export function canUseFeature(feature: FeatureKey): boolean {
  const required = featureRequiresPlan(feature);
  if (!required) return true;
  return hasAccess(required);
}

export function isFeatureLocked(feature: FeatureKey): boolean {
  const required = featureRequiresPlan(feature);
  if (!required) return false;
  return isNavItemLocked(required);
}

export function upgradeLabelForFeature(feature: FeatureKey): string {
  const plan = featureRequiresPlan(feature);
  if (!plan) return "Upgrade";
  return `Upgrade to ${PLAN_LABEL[plan] ?? plan}`;
}

export function upgradeMessageForFeature(feature: FeatureKey): string {
  const plan = featureRequiresPlan(feature);
  if (!plan) return "This feature requires an upgraded plan.";
  return `This feature requires the ${PLAN_LABEL[plan] ?? plan} plan or higher.`;
}
