import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { get } }));

import { fetchConsultancyTeam, resetConsultancyTeamCache } from "./use-consultancy-team";
import { CONSULTANCY_NAV_GROUP, DASHBOARD_NAV_FLAT, DASHBOARD_NAV_GROUPS, navItemByPath } from "./dashboard-nav";

beforeEach(() => {
  get.mockReset();
  resetConsultancyTeamCache();
});

describe("is the signed-in user on the consultancy team", () => {
  it("is true only when the gateway says so", async () => {
    get.mockResolvedValue({ admin: true });
    expect(await fetchConsultancyTeam()).toBe(true);
    expect(get).toHaveBeenCalledWith("/consultancy-admin/me");
  });

  it("is false for a refusal, a missing answer or a network error, so the screens stay hidden", async () => {
    for (const answer of [() => Promise.reject(new Error("Team access only")), () => Promise.resolve({}), () => Promise.resolve(null), () => Promise.resolve({ admin: "yes" })]) {
      resetConsultancyTeamCache();
      get.mockReset();
      get.mockImplementation(answer);
      expect(await fetchConsultancyTeam()).toBe(false);
    }
  });

  it("asks the gateway once, even for several callers at the same time", async () => {
    get.mockResolvedValue({ admin: true });
    const answers = await Promise.all([fetchConsultancyTeam(), fetchConsultancyTeam(), fetchConsultancyTeam()]);
    expect(answers).toEqual([true, true, true]);
    await fetchConsultancyTeam();
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("the team-only navigation", () => {
  it("is not part of the normal sidebar groups", () => {
    expect(DASHBOARD_NAV_GROUPS.some((g) => g.labelKey === CONSULTANCY_NAV_GROUP.labelKey)).toBe(false);
  });

  it("still gives every team page a title", () => {
    for (const item of CONSULTANCY_NAV_GROUP.items) {
      expect(DASHBOARD_NAV_FLAT).toContain(item);
      expect(navItemByPath(item.href)?.labelKey).toBe(item.labelKey);
    }
  });
});
