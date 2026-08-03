/** Must stay aligned with gateway `SUPPORTED_LANGUAGES` / realtime receptionist. */
export const AGENT_LANGUAGES = [
  { id: "en", name: "English", flag: "🇺🇸" },
  { id: "es", name: "Spanish", flag: "🇪🇸" },
  { id: "fr", name: "French", flag: "🇫🇷" },
  { id: "ru", name: "Russian", flag: "🇷🇺" },
  { id: "zh", name: "Mandarin", flag: "🇨🇳" },
  { id: "hi", name: "Hindi", flag: "🇮🇳" },
] as const;

export type AgentLanguageId = (typeof AGENT_LANGUAGES)[number]["id"];
