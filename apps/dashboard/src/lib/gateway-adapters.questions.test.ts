import { describe, expect, it } from "vitest";
import { normalizeAIConfig, toAIConfigSavePayload } from "./gateway-adapters";

describe("agent settings: qualifying questions", () => {
  it("reads the saved questions and ignores empty ones", () => {
    expect(normalizeAIConfig({ qualificationQuestions: ["What service?", "  ", "When?"] }).qualificationQuestions).toEqual(["What service?", "When?"]);
    expect(normalizeAIConfig({ qualification_questions: ["One"] }).qualificationQuestions).toEqual(["One"]);
  });

  it("gives an empty list when nothing is saved or the data is odd", () => {
    expect(normalizeAIConfig({}).qualificationQuestions).toEqual([]);
    expect(normalizeAIConfig({ qualificationQuestions: "text" }).qualificationQuestions).toEqual([]);
    expect(normalizeAIConfig(null).qualificationQuestions).toEqual([]);
  });

  it("sends the questions with the rest of the settings when saving", () => {
    const config = normalizeAIConfig({ qualificationQuestions: ["What service?"], allowedLanguages: ["en"] });
    const payload = toAIConfigSavePayload(config) as Record<string, unknown>;
    expect(payload.qualificationQuestions).toEqual(["What service?"]);
    expect("allowedLanguages" in payload).toBe(false);
  });
});
