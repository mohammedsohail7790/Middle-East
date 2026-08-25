import { describe, expect, it } from "vitest";
import { resolveMarketingPage } from "../../../apps/dashboard/src/lib/marketing-routes";

describe("resolveMarketingPage", () => {
  it("maps known marketing paths", () => {
    expect(resolveMarketingPage("/")).toBe("home");
    expect(resolveMarketingPage("/pricing")).toBe("pricing");
    expect(resolveMarketingPage("/features/")).toBe("features");
  });

  it("maps industry slugs", () => {
    expect(resolveMarketingPage("/industries/hvac")).toBe("industry-hvac");
  });

  it("falls back to home", () => {
    expect(resolveMarketingPage("/unknown-page")).toBe("home");
  });
});
