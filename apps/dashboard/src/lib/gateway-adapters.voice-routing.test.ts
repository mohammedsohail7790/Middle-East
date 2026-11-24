import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { voiceRoutingToApi } from "./gateway-adapters";

const page = readFileSync(join(__dirname, "../app/[locale]/dashboard/agent/page.tsx"), "utf8");

describe("Voice & routing save", () => {
  it("sends only the timezone, so it can never overwrite the language, tone or transfer number saved above", () => {
    // The page holds the whole settings object; the helper must keep only the timezone.
    const held = {
      companyName: "Acme",
      language: "en",
      timezone: "Asia/Dubai",
      tone: "friendly",
      transferNumber: "+971500000000",
    };
    const body = voiceRoutingToApi(held);
    expect(body).toEqual({ timezone: "Asia/Dubai" });
  });
});

describe("Voice Agents page has each setting once", () => {
  it("the Voice & routing card no longer repeats Language, Tone or Transfer number", () => {
    const start = page.indexOf('id="voice-routing"');
    const end = page.indexOf('id="voice-preview"');
    const card = page.slice(start, end);
    expect(card).toContain("vr-timezone");
    expect(card).not.toContain("vr-language");
    expect(card).not.toContain("vr-tone-label");
    expect(card).not.toContain("vr-transfer-number");
  });

  it("saves through voiceRoutingToApi, not the full company settings", () => {
    expect(page).toContain("voiceRoutingToApi(voiceRouting)");
    expect(page).not.toContain("tenantSettingsToApi(voiceRouting)");
  });
});
