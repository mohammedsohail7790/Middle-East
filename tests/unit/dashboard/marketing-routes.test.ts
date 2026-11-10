import { describe, expect, it } from "vitest";
import {
  isKnownMarketingPath,
  plainAppPath,
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

describe("retired services", () => {
  it("send old brand and acquisition links to the operations page", () => {
    expect(resolveMarketingPage("/services/brand")).toBe("svc-operations");
    expect(resolveMarketingPage("/services/acquisition")).toBe("svc-operations");
  });
});

describe("isMarketingHref", () => {
  it("recognises consultancy and service paths", () => {
    expect(isMarketingHref("/")).toBe(true);
    expect(isMarketingHref("/consult-signup")).toBe(true);
    expect(isMarketingHref("/services/operations")).toBe(true);
    expect(isMarketingHref("/industries/hvac")).toBe(true);
    expect(isMarketingHref("/dashboard")).toBe(false);
  });
});

describe("isKnownMarketingPath", () => {
  const ids = new Set(["industry-clinics", "solutions-answering"]);
  it("accepts real pages, with or without a language segment or trailing slash", () => {
    for (const p of ["/", "/pricing", "/pricing/", "/en", "/ar", "/en/pricing", "/opportunity-audit", "/industries/clinics", "/solutions/answering"]) {
      expect(isKnownMarketingPath(p, ids), p).toBe(true);
    }
  });
  it("rejects addresses that are not pages", () => {
    for (const p of ["/unknown-page", "/industries/nope", "/solutions/nope", "/pricing/extra", "/en/unknown"]) {
      expect(isKnownMarketingPath(p, ids), p).toBe(false);
    }
  });
});

describe("plainAppPath", () => {
  it("sends language-prefixed app pages to their plain address", () => {
    expect(plainAppPath("/en/onboarding")).toBe("/onboarding");
    expect(plainAppPath("/ar/login/")).toBe("/login");
    expect(plainAppPath("/en/signup")).toBe("/signup");
  });
  it("leaves everything else alone", () => {
    expect(plainAppPath("/en/pricing")).toBeNull();
    expect(plainAppPath("/onboarding")).toBeNull();
    expect(plainAppPath("/en/dashboard")).toBeNull();
  });
});
