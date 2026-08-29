import { describe, expect, it } from "vitest";
import { INDUSTRIES, PLACEHOLDER_CATEGORIES } from "./industries";

describe("industries content", () => {
  it("has exactly 6 industries with slugs matching production data", () => {
    const slugs = INDUSTRIES.map((i) => i.slug).sort();
    expect(slugs).toEqual(
      ["cleaning", "electrical", "hvac", "landscaping", "legal", "plumbing"].sort(),
    );
  });

  it("every industry has at least one FAQ", () => {
    expect(INDUSTRIES.every((i) => i.faqs.length > 0)).toBe(true);
  });

  it("has 3 placeholder categories for the index page's non-detail cards", () => {
    expect(PLACEHOLDER_CATEGORIES).toHaveLength(3);
    expect(PLACEHOLDER_CATEGORIES.flatMap((c) => c.items).length).toBeGreaterThan(0);
  });
});
