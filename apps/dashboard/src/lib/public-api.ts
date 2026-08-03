/** Unauthenticated reads against the gateway (pricing, plan definitions). */

import { getGatewayBaseUrl } from "./api";

const DEFAULT_GATEWAY = "https://call-iq-gateway.onrender.com";

function publicApiBase(): string {
  if (typeof window !== "undefined") {
    return getGatewayBaseUrl().replace(/\/$/, "");
  }
  const url =
    process.env.GATEWAY_PROXY_URL ||
    process.env.NEXT_PUBLIC_GATEWAY_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_GATEWAY;
  return url.replace(/\/$/, "");
}

export type PlanPricingTier = {
  amount: number;
  currency: string;
  interval: "month" | "year";
  estimated?: boolean;
};

export type GatewayPlan = {
  key: string;
  name: string;
  price: number;
  includedMinutes: number;
  overageRate: number;
  badge?: string;
  trial?: { days: number; requiresCard: boolean };
  features?: Record<string, unknown>;
  pricing?: {
    monthly: PlanPricingTier;
    annual: PlanPricingTier;
  };
  checkoutReady?: boolean;
};

async function parsePlansResponse(res: Response): Promise<Record<string, GatewayPlan>> {
  if (!res.ok) {
    throw new Error(`Plans API ${res.status}`);
  }
  const json = (await res.json()) as { success?: boolean; data?: Record<string, GatewayPlan> };
  if (!json.data) throw new Error("Invalid plans response");
  return json.data;
}

export type BillingPlansState = {
  plans: Record<string, GatewayPlan>;
  checkoutEnabled: boolean;
};

function resolveCheckoutEnabled(
  plans: Record<string, GatewayPlan>,
  meta?: { checkoutEnabled?: boolean }
): boolean {
  const rows = Object.values(plans);
  const anyPlanReady = rows.some((p) => p.checkoutReady === true);
  if (meta?.checkoutEnabled === true || anyPlanReady) return true;
  if (meta?.checkoutEnabled === false && !anyPlanReady) return false;
  return anyPlanReady;
}

export async function fetchBillingPlansState(): Promise<BillingPlansState | null> {
  try {
    const res = await fetch(`${publicApiBase()}/api/v1/billing/plans`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Record<string, GatewayPlan>;
      meta?: { checkoutEnabled?: boolean };
    };
    if (!json.data || !Object.keys(json.data).length) return null;
    return {
      plans: json.data,
      checkoutEnabled: resolveCheckoutEnabled(json.data, json.meta),
    };
  } catch {
    return null;
  }
}

export async function fetchPublicPlans(): Promise<Record<string, GatewayPlan>> {
  const res = await fetch(`${publicApiBase()}/api/v1/billing/plans`, { cache: "no-store" });
  return parsePlansResponse(res);
}

/** Server components (pricing page SSR). */
export async function fetchPublicPlansServer(): Promise<Record<string, GatewayPlan> | null> {
  try {
    const res = await fetch(`${publicApiBase()}/api/v1/billing/plans`, {
      next: { revalidate: 300 },
    });
    return await parsePlansResponse(res);
  } catch {
    return null;
  }
}
