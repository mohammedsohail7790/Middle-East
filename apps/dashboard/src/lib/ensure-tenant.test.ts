import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A login can remember a workspace that no longer exists. These check that only a clear "Tenant not found" sends the client back to setup,
 * and that a slow or broken gateway never does.
 */
const h = vi.hoisted(() => ({
  get: vi.fn(),
  updateUser: vi.fn(),
  refreshSession: vi.fn(),
  getUser: vi.fn(),
  clearTenantId: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { get: h.get, post: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { updateUser: h.updateUser, refreshSession: h.refreshSession, getUser: h.getUser } },
}));
vi.mock("@/lib/store", () => ({
  clearTenantId: h.clearTenantId,
  getTenantId: () => null,
  setTenantId: vi.fn(),
}));

import { dropStaleTenant, resolveOnboardingEntry } from "./ensure-tenant";

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.updateUser.mockResolvedValue({});
  h.refreshSession.mockResolvedValue({});
});

describe("dropStaleTenant", () => {
  it("leaves a workspace that still exists alone", async () => {
    h.get.mockResolvedValue({ id: "tid" });
    expect(await dropStaleTenant()).toBe(false);
    expect(h.clearTenantId).not.toHaveBeenCalled();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("forgets a deleted workspace in the cache and in the login's metadata", async () => {
    h.get.mockRejectedValue(new Error("Tenant not found"));
    expect(await dropStaleTenant()).toBe(true);
    expect(h.clearTenantId).toHaveBeenCalledTimes(1);
    expect(h.updateUser).toHaveBeenCalledWith({ data: { tenant_id: null } });
  });

  it("still reports the workspace gone if cleaning the login's metadata fails", async () => {
    h.get.mockRejectedValue(new Error("Tenant not found"));
    h.updateUser.mockRejectedValue(new Error("network"));
    expect(await dropStaleTenant()).toBe(true);
    expect(h.clearTenantId).toHaveBeenCalledTimes(1);
  });

  it("never sends the client back to setup because the gateway is slow, cold or failing", async () => {
    for (const message of ["Request timed out", "API 502", "Could not reach the server", "Access denied — check your workspace tenant."]) {
      h.get.mockReset();
      h.get.mockRejectedValue(new Error(message));
      expect(await dropStaleTenant()).toBe(false);
    }
    expect(h.clearTenantId).not.toHaveBeenCalled();
    expect(h.updateUser).not.toHaveBeenCalled();
  });
});

describe("resolveOnboardingEntry with a remembered workspace", () => {
  const withRememberedTenant = () =>
    h.getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: { tenant_id: "old-tenant" } } } });

  it("starts setup fresh when the remembered workspace is gone", async () => {
    withRememberedTenant();
    h.get.mockRejectedValue(new Error("Tenant not found"));
    expect(await resolveOnboardingEntry()).toEqual({ tenantId: null, resumeStep: null, redirectToDashboard: false });
  });

  it("goes to the dashboard when the remembered workspace exists and setup is complete", async () => {
    withRememberedTenant();
    h.get.mockImplementation(async (path: string) => (path === "/onboarding/progress" ? { completed: true } : { id: "old-tenant" }));
    expect(await resolveOnboardingEntry()).toMatchObject({ tenantId: "old-tenant", redirectToDashboard: true });
  });
});
