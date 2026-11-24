import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { ALL_INTEGRATION_DEFS, CATEGORY_LABELS } from "@/lib/integration-hub-catalog";

const hub = (m: any) => m.pages.integrations.hub;
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

describe("integrations hub text", () => {
  it("names every category in English and Arabic", () => {
    for (const category of Object.keys(CATEGORY_LABELS)) {
      expect(hub(en).categories[category], `en ${category}`).toBeTruthy();
      expect(hasArabic(hub(ar).categories[category]), `ar ${category}`).toBe(true);
    }
  });

  it("describes every provider in the catalog in Arabic, and the English matches the catalog", () => {
    for (const integration of ALL_INTEGRATION_DEFS) {
      expect(hub(en).taglines[integration.id], `en ${integration.id}`).toBe(integration.tagline);
      expect(hasArabic(hub(ar).taglines[integration.id]), `ar ${integration.id}`).toBe(true);
    }
  });

  it("has the same card, bar and Zapier keys in both languages", () => {
    for (const group of ["card", "bar", "zapier"]) {
      expect(Object.keys(hub(ar)[group]).sort(), group).toEqual(Object.keys(hub(en)[group]).sort());
    }
  });

  it("keeps the placeholder in the 'verified' line, so the time still shows", () => {
    expect(hub(en).card.verified).toContain("{ago}");
    expect(hub(ar).card.verified).toContain("{ago}");
  });

  it("translates the analytics range buttons and the average duration", () => {
    expect(ar.pages.analytics.avgDurationValue).toContain("{value}");
    expect(hasArabic(ar.pages.analytics.avgDurationValue)).toBe(true);
    for (const key of ["range7d", "range30d", "range90d"]) expect(hasArabic((ar.pages.analytics as any)[key]), key).toBe(true);
  });
});
