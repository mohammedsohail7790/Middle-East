import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { allowsDuringSetup, pickOnboardingTools } from "./OnboardingConnectTools";

const ids = (list: { id: string }[]) => list.map((i) => i.id);

const plan = vi.hoisted(() => ({ current: "trial", level: 0 }));
vi.mock("@/lib/store", () => ({
  getPlan: () => plan.current,
  hasAccess: (required?: string) => !required || plan.level >= (required === "professional" ? 2 : 1),
}));

describe("allowsDuringSetup", () => {
  it("lets a new trial workspace use Professional tools", () => {
    plan.current = "trial";
    plan.level = 0;
    expect(allowsDuringSetup("professional")).toBe(true);
  });

  it("still holds back a paid starter plan from Professional tools", () => {
    plan.current = "starter";
    plan.level = 1;
    expect(allowsDuringSetup("professional")).toBe(false);
    expect(allowsDuringSetup("starter")).toBe(true);
  });
});

describe("pickOnboardingTools", () => {
  it("offers a calendar only when its sign-in is configured on the gateway", () => {
    expect(ids(pickOnboardingTools({}, {}, () => true).calendars)).toEqual([]);
    expect(ids(pickOnboardingTools({ "google-calendar": true }, {}, () => true).calendars)).toContain("google-calendar");
  });

  it("hides tools the client's plan does not include", () => {
    const cfg = { hubspot: true, "google-calendar": true };
    const free = pickOnboardingTools(cfg, {}, () => false);
    expect(ids(free.crms)).not.toContain("hubspot");
    expect(ids(free.calendars)).toContain("google-calendar");
    expect(ids(pickOnboardingTools(cfg, {}, () => true).crms)).toContain("hubspot");
  });

  it("keeps an already connected tool visible so the client sees it ticked", () => {
    const out = pickOnboardingTools({}, { hubspot: true }, () => false);
    expect(ids(out.crms)).toContain("hubspot");
  });
});
