/** Must stay aligned with gateway `SUPPORTED_LANGUAGES` / realtime receptionist. */
export const AGENT_LANGUAGES = [
  { id: "ar", name: "Arabic (Saudi)", flag: "🇸🇦" },
  { id: "en", name: "English", flag: "🇺🇸" },
  { id: "hi", name: "Hindi", flag: "🇮🇳" },
  { id: "ru", name: "Russian", flag: "🇷🇺" },
] as const;

export type AgentLanguageId = (typeof AGENT_LANGUAGES)[number]["id"];
