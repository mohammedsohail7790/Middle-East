import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { ALL_INTEGRATION_DEFS } from "@/lib/integration-hub-catalog";

const hub = (m: any) => m.pages.integrations.hub;
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
const slots = (s: string) => [...s.matchAll(/\{[a-zA-Z]+\}|<\/?[a-zA-Z]+>/g)].map((m) => m[0]).sort();

describe("provider setup steps and region names", () => {
  it("has Arabic steps for every provider that has English steps, in the same number and order, and the English matches the catalog", () => {
    let checked = 0;
    for (const integration of ALL_INTEGRATION_DEFS) {
      const steps = integration.helpSteps;
      if (!steps) continue;
      const e = hub(en).providers[integration.id];
      const a = hub(ar).providers[integration.id];
      expect(e, `en ${integration.id}`).toBeTruthy();
      expect(a, `ar ${integration.id}`).toBeTruthy();
      steps.forEach((step, i) => {
        const key = `step${i + 1}`;
        expect(e[key], `en ${integration.id}.${key} matches the catalog`).toBe(step);
        expect(hasArabic(a[key]), `ar ${integration.id}.${key} is Arabic`).toBe(true);
        expect(slots(a[key]), `${integration.id}.${key} placeholders`).toEqual(slots(e[key]));
        checked++;
      });
      // no extra or missing steps: the number of step keys is exactly the number of catalog steps
      expect(Object.keys(a).filter((k) => /^step\d+$/.test(k))).toHaveLength(steps.length);
      expect(Object.keys(e).filter((k) => /^step\d+$/.test(k))).toHaveLength(steps.length);
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("translates the 'connect another way' label and keeps English matching the catalog", () => {
    const zoho = ALL_INTEGRATION_DEFS.find((i) => i.id === "zoho")!;
    expect(hub(en).providers.zoho.alternateLabel).toBe(zoho.alternateCredentialLabel);
    expect(hasArabic(hub(ar).providers.zoho.alternateLabel)).toBe(true);
  });

  it("names every Zoho data center in Arabic, and the English matches the catalog", () => {
    const zoho = ALL_INTEGRATION_DEFS.find((i) => i.id === "zoho")!;
    const select = zoho.fields!.find((f) => f.key === "dataCenter")!;
    const keyOf = (value: string) => value.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase());
    for (const option of select.options!) {
      expect(hub(en).regions[keyOf(option.value)], `en ${option.value}`).toBe(option.label);
      expect(hasArabic(hub(ar).regions[keyOf(option.value)]), `ar ${option.value}`).toBe(true);
    }
  });
});
