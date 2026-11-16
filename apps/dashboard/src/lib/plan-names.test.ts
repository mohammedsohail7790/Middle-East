import { describe, expect, it } from "vitest";
import { navLockedTitle } from "./dashboard-nav";
import { upgradeLabelForFeature, upgradeMessageForFeature } from "./plan-features";

describe("entry plan name", () => {
  it("is Essential everywhere the dashboard names it, matching the pricing page", () => {
    const item = { href: "/x", label: "Thing", labelKey: "k", plan: "essential" as const };
    expect(navLockedTitle(item, true)).toBe("Thing — requires Essential plan");
    expect(upgradeLabelForFeature("outbound")).toBe("Upgrade to Essential");
    expect(upgradeMessageForFeature("campaigns")).toBe("This feature requires the Essential plan or higher.");
  });
});
