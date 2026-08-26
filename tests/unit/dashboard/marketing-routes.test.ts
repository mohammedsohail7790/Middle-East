import { describe, expect, it } from "vitest";
import {
  isMarketingHref,
  resolveMarketingPage,
} from "../../../apps/dashboard/src/lib/marketing-routes";

describe("resolveMarketingPage", () => {
  it("maps known marketing paths", () => {
    expect(resolveMarketingPage("/")).toBe("consultancy");
    expect(resolveMarketingPage("/home")).toBe("home");
    expect(resolveMarketingPage("/pricing")).toBe("pricing");
    expect(resolveMarketingPage("/features/")).toBe("features");
    expect(resolveMarketingPage("/services/operations")).toBe("svc-operations");
  });

  it("maps industry slugs", () => {
    expect(resolveMarketingPage("/industries/hvac")).toBe("industry-hvac");
  });

  it("maps solution slugs", () => {
    expect(resolveMarketingPage("/solutions/answering")).toBe("solutions-answering");
  });

  it("falls back to consultancy", () => {
    expect(resolveMarketingPage("/unknown-page")).toBe("consultancy");
  });
});

describe("isMarketingHref", () => {
  it("recognises consultancy and service paths", () => {
    expect(isMarketingHref("/")).toBe(true);
    expect(isMarketingHref("/consult-signup")).toBe(true);
    expect(isMarketingHref("/services/brand")).toBe(true);
    expect(isMarketingHref("/industries/hvac")).toBe(true);
    expect(isMarketingHref("/dashboard")).toBe(false);
  });
});
