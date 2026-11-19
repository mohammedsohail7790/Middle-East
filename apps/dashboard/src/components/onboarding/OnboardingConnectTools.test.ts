import { describe, expect, it } from "vitest";
import { pickOnboardingTools } from "./OnboardingConnectTools";

const ids = (list: { id: string }[]) => list.map((i) => i.id);

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
