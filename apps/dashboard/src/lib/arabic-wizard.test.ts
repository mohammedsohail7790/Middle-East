import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { relativeTimeLabel } from "@/lib/relative-time";

const hub = (m: any) => m.pages.integrations.hub;
const GROUPS = ["wizard", "hubVisual", "media", "callOffer", "easyPath", "crmGuide"];
const ASSISTANT_KEYS = ["assistantWelcome", "assistantStarter1", "assistantStarter2", "assistantStarter3", "assistantStarter4", "assistantScanning", "assistantUnreachable", "assistantStreaming", "assistantSubtitle"];
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
/** The {placeholders} and <tags> a message uses, so a translation cannot drop one. */
const slots = (s: string) => [...s.matchAll(/\{[a-zA-Z]+\}|<\/?[a-zA-Z]+>/g)].map((m) => m[0]).sort();

describe("wizard, guide and assistant text", () => {
  for (const group of GROUPS) {
    it(`${group}: the same keys in both languages, each Arabic, each keeping its placeholders and tags`, () => {
      const e = hub(en)[group] as Record<string, string>;
      const a = hub(ar)[group] as Record<string, string>;
      expect(Object.keys(a).sort(), group).toEqual(Object.keys(e).sort());
      for (const key of Object.keys(e)) {
        expect(hasArabic(a[key]), `${group}.${key} is Arabic`).toBe(true);
        expect(slots(a[key]), `${group}.${key} placeholders`).toEqual(slots(e[key]));
      }
    });
  }

  it("the assistant's opening message, starters and status text exist in Arabic", () => {
    for (const key of ASSISTANT_KEYS) {
      expect((en.shell as Record<string, string>)[key], `en ${key}`).toBeTruthy();
      expect(hasArabic((ar.shell as Record<string, string>)[key]), `ar ${key}`).toBe(true);
    }
  });
});

describe("relativeTimeLabel", () => {
  afterEach(() => vi.useRealTimers());
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

  it("keeps the English wording", () => {
    expect(relativeTimeLabel(at(0), "en")).toBe("just now");
    expect(relativeTimeLabel(at(5), "en")).toBe("5m ago");
    expect(relativeTimeLabel(at(120), "en")).toBe("2h ago");
    expect(relativeTimeLabel(at(60 * 24 * 3), "en")).toBe("3d ago");
  });

  it("gives Arabic text with Western digits in Arabic", () => {
    for (const minutes of [5, 120, 60 * 24 * 3]) {
      const label = relativeTimeLabel(at(minutes), "ar");
      expect(hasArabic(label), `${minutes} min`).toBe(true);
      expect(label).not.toMatch(/[٠-٩]/);
    }
  });
});
