import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { ALL_INTEGRATION_DEFS, type IntegrationField } from "@/lib/integration-hub-catalog";
import {
  getGuidedWizardIntro,
  getPlainCredentialCopy,
  getPlainStepTitle,
  type PlainTranslator,
} from "@/lib/integration-plain-language";

const plain = (m: any) => m.pages.integrations.hub.plain as Record<string, string>;
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
/** Examples and web addresses that read the same in both languages. */
const SAME_IN_BOTH = new Set(["freshPlaceholder", "yardiPlaceholder", "userEmailPlaceholder"]);
const slots = (s: string) => [...s.matchAll(/\{[a-zA-Z]+\}/g)].map((m) => m[0]).sort();

const translator = (messages: Record<string, string>): PlainTranslator => (key, values) =>
  messages[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));

const byId = (id: string) => ALL_INTEGRATION_DEFS.find((i) => i.id === id)!;
const fieldOf = (_id: string, key: string) => ({ key, label: key, type: "text", placeholder: "" }) as unknown as IntegrationField;

describe("per-provider setup text", () => {
  it("has the same keys in both languages, each Arabic, each keeping its placeholders", () => {
    expect(Object.keys(plain(ar)).sort()).toEqual(Object.keys(plain(en)).sort());
    for (const key of Object.keys(plain(en))) {
      if (!SAME_IN_BOTH.has(key)) expect(hasArabic(plain(ar)[key]), `ar ${key}`).toBe(true);
      expect(slots(plain(ar)[key]), `${key} placeholders`).toEqual(slots(plain(en)[key]));
    }
  });

  it("keeps the English wording the dashboard showed before", () => {
    const copper = getPlainCredentialCopy(byId("copper"), fieldOf("copper", "apiKey"));
    expect(copper.label).toBe("Paste your API key");
    expect(copper.helpBody).toBe("In Copper open System settings → API Keys, click Generate API Key, then copy the full key here.");

    const housecall = getPlainCredentialCopy(byId("housecallpro"), fieldOf("housecallpro", "apiKey"));
    expect(housecall.label).toBe("Paste your connection code");
    expect(housecall.placeholder).toBe("Paste here");
    expect(housecall.helpTitle).toBe("Where to find this in Housecall Pro");

    expect(getGuidedWizardIntro(byId("copper"))).toBe(
      "Paste your Copper credentials below — use the sign-in button if you need to copy them from your account. About 2 minutes."
    );
    expect(getPlainStepTitle(byId("copper"), 0, 3)).toBe("Step 1 — Open settings and copy");
    expect(getPlainStepTitle(byId("copper"), 1, 3)).toBe("Step 2 — Copy the next item");
    expect(getPlainStepTitle(byId("copper"), 2, 3)).toBe("Step 3 — Paste and finish");
  });

  it("gives Arabic for a provider's fields, with the provider name kept in English", () => {
    const t = translator(plain(ar));
    const copy = getPlainCredentialCopy(byId("housecallpro"), fieldOf("housecallpro", "apiKey"), t);
    expect(hasArabic(copy.label)).toBe(true);
    expect(copy.helpTitle).toContain("Housecall Pro");
    expect(hasArabic(copy.helpBody!)).toBe(true);
    expect(hasArabic(getGuidedWizardIntro(byId("copper"), t))).toBe(true);
    expect(getGuidedWizardIntro(byId("copper"), t)).toContain("Copper");
    expect(getPlainStepTitle(byId("copper"), 1, 3, t)).toMatch(/2/);
  });
});
