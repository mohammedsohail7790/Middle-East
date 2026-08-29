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

  it("has 3 annual savings rows and 13 feature comparison rows", () => {
    expect(ANNUAL_SAVINGS_ROWS).toHaveLength(3);
    expect(FEATURE_COMPARISON_ROWS).toHaveLength(13);
  });

  it("has exactly 2 ROI plan options matching production's calculator", () => {
    expect(ROI_PLAN_OPTIONS).toEqual([
      { label: "Essential — $39/mo", value: 39 },
      { label: "Professional — $149/mo", value: 149 },
    ]);
  });
});
