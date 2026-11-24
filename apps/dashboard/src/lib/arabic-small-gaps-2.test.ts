import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { formatChartDay } from "@/lib/utils";

describe("chart day labels", () => {
  it("stay English by default", () => {
    expect(formatChartDay("2026-10-02")).toBe("Oct 2");
  });
  it("use Arabic month names with Western digits in Arabic", () => {
    const label = formatChartDay("2026-10-02", "ar");
    expect(label).toMatch(/[؀-ۿ]/); // Arabic letters
    expect(label).toMatch(/\b2\b/); // Western digit, like the rest of the dashboard
    expect(label).not.toMatch(/[٠-٩]/);
  });
  it("hands back what it cannot read", () => {
    expect(formatChartDay("not a date", "ar")).toBe("not a date");
  });
});

const SHELL_KEYS = [
  "expandSidebar", "collapseSidebar", "closeMenu", "mainNavigation", "footerTagline", "breadcrumb", "notifications", "alerts",
  "assistantLabel", "assistantTitle", "assistantOpen", "assistantClose", "assistantCloseShort", "assistantPlaceholder", "assistantSend",
];
const PROFILES = ["healthcare", "legal", "real_estate", "general"];

describe("Arabic text for the dashboard shell and compliance page", () => {
  for (const [lang, messages] of [["English", en], ["Arabic", ar]] as const) {
    it(`${lang} has every shell label`, () => {
      for (const key of SHELL_KEYS) expect((messages.shell as Record<string, string>)[key], `${lang} shell.${key}`).toBeTruthy();
    });
    it(`${lang} names and describes every compliance profile`, () => {
      const profiles = (messages.pages.compliance as any).profiles;
      for (const id of PROFILES) {
        expect(profiles[id].label, `${lang} ${id} label`).toBeTruthy();
        expect(profiles[id].description, `${lang} ${id} description`).toBeTruthy();
      }
    });
    it(`${lang} HIPAA note keeps the email link slot`, () => {
      const body: string = (messages.pages.compliance as any).hipaaBaaBody;
      expect(body).toContain("<mail>{email}</mail>");
    });
  }

  it("the Arabic shell labels are really Arabic", () => {
    for (const key of SHELL_KEYS) expect((ar.shell as Record<string, string>)[key], `ar shell.${key}`).toMatch(/[؀-ۿ]/);
  });
});
