// Tenant + plan store (localStorage)

const PLAN_LEVEL: Record<string, number> = {
  trial: 0,
  starter: 1,
  essential: 1,
  professional: 2,
};

/** Map API/marketing plan ids to sidebar gate ids */
export function normalizePlanId(plan: string | undefined | null): string {
  if (!plan) return "trial";
  const p = plan.toLowerCase();
  if (p === "starter") return "essential";
  return p;
}

export function getPlan(): string {
  if (typeof window === "undefined") return "trial";
  return normalizePlanId(localStorage.getItem("calliq_plan"));
}

export function setPlan(plan: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("calliq_plan", normalizePlanId(plan));
  window.dispatchEvent(new Event("calliq-plan-updated"));
}

export function setTenantId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("calliq_tenant_id", id);
  document.cookie = `calliq_tenant_id=${encodeURIComponent(id)}; path=/; max-age=2592000; samesite=lax`;
  window.dispatchEvent(new CustomEvent("calliq-tenant-ready", { detail: { tenantId: id } }));
}

export function getTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("calliq_tenant_id");
}

/** Clear workspace scope on sign-out or failed tenant resolution */
export function clearTenantId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("calliq_tenant_id");
  document.cookie = "calliq_tenant_id=; path=/; max-age=0; samesite=lax";
}

export function hasAccess(requiredPlan?: string): boolean {
  if (!requiredPlan) return true;
  const current = getPlan();
  return (PLAN_LEVEL[current] ?? 0) >= (PLAN_LEVEL[normalizePlanId(requiredPlan)] ?? 0);
}

/** Sidebar gate: lock paid nav only when trial is exhausted (not during active trial). */
export function isNavItemLocked(requiredPlan?: string): boolean {
  if (!requiredPlan) return false;
  if (typeof window !== "undefined" && localStorage.getItem("calliq_trial_locked") === "1") {
    return true;
  }
  return !hasAccess(requiredPlan);
}

/** Sync plan for sidebar — active trial gets professional routes; locked trial does not. */
/** Subscribe to plan / trial lock changes (billing SSE, checkout, layout init). */
export function subscribePlanUpdates(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener("calliq-plan-updated", handler);
  return () => window.removeEventListener("calliq-plan-updated", handler);
}

export function syncPlanFromAccount(input: {
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  isTrialing?: boolean;
  trialLocked?: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (input.subscriptionStatus) {
    localStorage.setItem("calliq_subscription_status", input.subscriptionStatus);
  }
  if (input.trialLocked) {
    localStorage.setItem("calliq_trial_locked", "1");
    setPlan("trial");
    return;
  }
  localStorage.removeItem("calliq_trial_locked");
  if (input.isTrialing) {
    setPlan("professional");
    window.dispatchEvent(new Event("calliq-plan-updated"));
    return;
  }
  if (input.subscriptionPlan) {
    setPlan(
      normalizePlanId(
        input.subscriptionStatus === "trialing" ? "professional" : input.subscriptionPlan
      )
    );
  }
}

/** Active paid subscription (not free trial). */
export function isPayingCustomer(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("calliq_trial_locked") === "1") return false;
  const status = localStorage.getItem("calliq_subscription_status");
  if (status === "active" || status === "past_due") return true;
  const plan = getPlan();
  return plan === "essential" || plan === "professional";
}
