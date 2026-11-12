/** Must stay aligned with gateway `SUPPORTED_LANGUAGES` / realtime receptionist. */
export const AGENT_LANGUAGES = [
  { id: "ar-SA", name: "Arabic (Saudi)" },
  { id: "ar-AE", name: "Arabic (Gulf: UAE, Kuwait, Qatar, Bahrain, Oman)" },
  { id: "ar-EG", name: "Arabic (Egyptian)" },
  { id: "ar-LB", name: "Arabic (Levantine)" },
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

/** True for any Arabic dialect code (ar-SA, ar-AE, ar-EG, ar-LB). Used for right-to-left layout and Arabic wording. */
export function isArabicLanguage(languageId: string | undefined | null): boolean {
  return String(languageId ?? "").toLowerCase().startsWith("ar");
}
