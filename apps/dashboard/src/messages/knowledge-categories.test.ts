import { describe, expect, it } from "vitest";
import en from "./en.json";
import ar from "./ar.json";

/** The knowledge categories the Business Profile page offers. The gateway accepts these same ids (knowledge.controller.ts), so each needs a name in every language we ship. */
const IDS = ["all", "general", "medical", "legal", "real_estate", "hvac", "plumbing", "electrical"];

const categories = (messages: any): Record<string, string> => {
  const found = JSON.stringify(messages).includes('"categories"')
    ? Object.values(messages.pages as Record<string, any>).find((p) => p && typeof p === "object" && p.categories && "hvac" in p.categories)
    : undefined;
  return (found as any)?.categories ?? {};
};

describe("knowledge category names", () => {
  for (const [lang, messages] of [["English", en], ["Arabic", ar]] as const) {
    it(`${lang} has a name for every category`, () => {
      const names = categories(messages);
      for (const id of IDS) expect(names[id], `${lang} name for ${id}`).toBeTruthy();
    });
  }
});
