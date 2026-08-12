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

/** Skeleton has no billing/plan tiers — every feature is unlocked. */
export function hasAccess(_requiredPlan?: string): boolean {
  return true;
}

/** Skeleton has no billing/plan tiers — nothing is nav-locked. */
export function isNavItemLocked(_requiredPlan?: string): boolean {
  return false;
}

/** Sync plan for sidebar — active trial gets professional routes; locked trial does not. */
/** Subscribe to plan / trial lock changes (billing SSE, checkout, layout init). */
export function subscribePlanUpdates(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener("calliq-plan-updated", handler);
  return () => window.removeEventListener("calliq-plan-updated", handler);
}

/** Skeleton has no billing provider — always reports as an active customer. */
export function isPayingCustomer(): boolean {
  return true;
}
