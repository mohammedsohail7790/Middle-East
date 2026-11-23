import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "../..", p), "utf8");
const en = JSON.parse(read("messages/en.json")).shell;
const ar = JSON.parse(read("messages/ar.json")).shell;

const KEYS = [
  "mobileNavPrimary",
  "mobileNavHome",
  "mobileNavCalls",
  "mobileNavLeads",
  "mobileNavAgent",
  "mobileNavMore",
  "searchPlaceholder",
  "searchLabel",
];

describe("mobile bottom bar and search are translated", () => {
  it("English and Arabic both have every key, and the Arabic is not the English text", () => {
    for (const k of KEYS) {
      expect(typeof en[k], `en ${k}`).toBe("string");
      expect(typeof ar[k], `ar ${k}`).toBe("string");
      expect(ar[k], `ar ${k} differs`).not.toBe(en[k]);
      expect(ar[k], `ar ${k} is Arabic`).toMatch(/[؀-ۿ]/);
    }
  });

  it("the bottom bar has no hard-coded English labels", () => {
    const src = read("components/dashboard-shell/MobileBottomNav.tsx");
    expect(src).toContain('useTranslations("shell")');
    for (const word of ['label: "Home"', 'label: "Calls"', 'label: "Leads"', 'label: "Agent"', 'aria-label="Primary"', 'aria-label="Open menu"']) {
      expect(src).not.toContain(word);
    }
    expect(src).not.toMatch(/^\s*More\s*$/m);
  });

  it("the global search has no hard-coded English placeholder or label", () => {
    const src = read("components/GlobalSearch.tsx");
    expect(src).toContain('useTranslations("shell")');
    expect(src).not.toContain('placeholder="Search calls, leads, transcripts…"');
    expect(src).not.toContain('aria-label="Global search"');
  });
});
