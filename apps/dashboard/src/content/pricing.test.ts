import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANNUAL_SAVINGS_ROWS, FEATURE_COMPARISON_ROWS, PRICING_PLANS, ROI_PLAN_OPTIONS } from "./pricing";

describe("pricing content", () => {
  it("has 3 pricing plans with the exact production prices", () => {
    const prices = PRICING_PLANS.map((p) => p.price).sort((a, b) => a - b);
    expect(prices).toEqual([39, 149, 499]);
  });

  it("marks exactly one plan as popular", () => {
    expect(PRICING_PLANS.filter((p) => p.popular)).toHaveLength(1);
    expect(PRICING_PLANS.find((p) => p.popular)?.name).toBe("Professional");
  });

  it("has 3 annual savings rows and 11 feature comparison rows", () => {
    expect(ANNUAL_SAVINGS_ROWS).toHaveLength(3);
    expect(FEATURE_COMPARISON_ROWS).toHaveLength(11);
  });

  it("Enterprise is Professional plus increased minutes, with no SLA, uptime or hosting claims", () => {
    const ent = PRICING_PLANS.find((p) => p.id === "enterprise");
    expect(ent?.features).toEqual(["Everything in Professional", "Increased minutes (4,000 included)"]);
    const all = JSON.stringify([PRICING_PLANS, FEATURE_COMPARISON_ROWS]);
    expect(all).not.toMatch(/99\.9|uptime|\bSLA\b|residency|hosting/i);
  });

  it("the live pricing copy has no uptime SLA and answers the UAE hosting question", () => {
    const html = readFileSync(join(__dirname, "../../public/marketing-body.html"), "utf8");
    expect(html).not.toMatch(/99\.9% uptime/i);
    expect(html).not.toMatch(/uptime SLA/i);
    expect(html.match(/Can Halla AI provide local UAE hosting\?/g)?.length).toBe(2);
    expect(html).toMatch(/Local UAE hosting is possible on request/);
    expect(html.match(/Everything in Professional, plus increased minutes\./g)?.length).toBe(2);
  });

  it("has exactly 2 ROI plan options matching production's calculator", () => {
    expect(ROI_PLAN_OPTIONS).toEqual([
      { label: "Essential — $39/mo", value: 39 },
      { label: "Professional — $149/mo", value: 149 },
    ]);
  });
});
