import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("automations messages", () => {
  const enKeys = keys((en as any).pages.automations);
  const arKeys = keys((ar as any).pages.automations);
  it("Arabic has every key English has", () => {
    expect(enKeys.length).toBeGreaterThan(50);
    expect(enKeys.filter((k) => !arKeys.includes(k))).toEqual([]);
  });
  it("Arabic has no extra keys and no empty values", () => {
    expect(arKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    const walk = (o: any): string[] => Object.values(o).flatMap((v) => (typeof v === "object" ? walk(v) : [String(v)]));
    expect(walk((ar as any).pages.automations).filter((v) => v.trim() === "")).toEqual([]);
  });
  it("uses the same placeholders in both languages and no dots in keys", () => {
    const flat = (o: any, p = ""): Array<[string, string]> => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, String(v)] as [string, string]]));
    const arMap = new Map(flat((ar as any).pages.automations));
    for (const [k, v] of flat((en as any).pages.automations)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(ph(arMap.get(k) ?? ""), k).toBe(ph(v));
    }
    const leaf = (o: any): string[] => Object.entries(o).flatMap(([k, v]) => [k, ...(typeof v === "object" ? leaf(v) : [])]);
    expect(leaf((en as any).pages.automations).filter((k) => k.includes("."))).toEqual([]);
  });
});
