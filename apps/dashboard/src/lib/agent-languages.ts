/** Must stay aligned with gateway `SUPPORTED_LANGUAGES` / realtime receptionist. */
export const AGENT_LANGUAGES = [
  { id: "ar-SA", name: "Arabic (Saudi)" },
  { id: "en", name: "English" },
  { id: "ur", name: "Urdu" },
  { id: "fr", name: "French" },
  { id: "zh", name: "Mandarin Chinese" },
  { id: "ru", name: "Russian" },
  { id: "fa", name: "Persian (Farsi)" },
  { id: "hi", name: "Hindi" },
] as const;

export type AgentLanguageId = (typeof AGENT_LANGUAGES)[number]["id"];

/** Match gateway plan language codes, including legacy `ar` ↔ `ar-SA`. */
export function isAgentLanguageAllowed(
  allowed: string[] | undefined,
  languageId: string
): boolean {
  if (!allowed?.length) return true;
  if (allowed.includes(languageId)) return true;
  if (languageId === "ar" && allowed.includes("ar-SA")) return true;
  if (languageId === "ar-SA" && allowed.includes("ar")) return true;
  return false;
}
