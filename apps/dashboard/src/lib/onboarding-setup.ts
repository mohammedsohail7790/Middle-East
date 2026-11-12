/**
 * What the sign-up wizard turns a client's answers into: the greeting the caller hears, the written brief the AI follows, the voice, the transfer number and the industry list.
 * It is plain functions with no screen code, so each rule is tested. The wizard saves the results with the same calls the AI Agent page uses (PUT /ai-config, PUT /tenants/:id,
 * POST /knowledge), so everything a client sets here can be changed later on that page.
 */
import { AGENT_LANGUAGES, isArabicLanguage, type AgentLanguageId } from "./agent-languages";

export type AfterHours = "message" | "transfer";

export interface SetupAnswers {
  company: string;
  description: string;
  services: string[];
  language: AgentLanguageId;
  timezone: string;
  days: string[];
  start: string;
  end: string;
  afterHours: AfterHours;
  transferNumber: string;
  urgent: string;
  agentName: string;
  tone: string;
  voice: string;
  greeting: string;
}

/** Voices the live receptionist supports, with the friendly names the AI Agent page uses. */
export const VOICE_CHOICES = [
  { id: "marin", name: "Maya", note: "Warm and clear" },
  { id: "coral", name: "Sarah", note: "Bright and friendly" },
  { id: "shimmer", name: "Emma", note: "Soft and calm" },
  { id: "cedar", name: "Chris", note: "Steady and professional" },
  { id: "ash", name: "Alex", note: "Relaxed and direct" },
  { id: "sage", name: "Sage", note: "Even and reassuring" },
] as const;

export const DEFAULT_VOICE = "marin";

const GULF_REGIONS = new Set(["ae", "kw", "qa", "bh", "om"]);
const LEVANT_REGIONS = new Set(["lb", "jo", "sy", "ps"]);

/**
 * The client's likely language from the browser: an Arabic browser gets the dialect of its country (Gulf for the UAE, Kuwait, Qatar, Bahrain and Oman, Egyptian, Levantine),
 * Saudi for plain Arabic or any other Arabic country, and English for anything we do not recognise. The client can change it on the first screen.
 */
export function guessLanguage(browserLanguage: string | undefined): AgentLanguageId {
  const l = (browserLanguage || "").trim().toLowerCase();
  const [lang, region = ""] = l.split(/[-_]/);
  if (lang === "ar") {
    if (GULF_REGIONS.has(region)) return "ar-AE";
    if (region === "eg") return "ar-EG";
    if (LEVANT_REGIONS.has(region)) return "ar-LB";
    return "ar-SA";
  }
  const hit = AGENT_LANGUAGES.find((x) => x.id.toLowerCase() === l || x.id.toLowerCase().split("-")[0] === lang);
  return (hit?.id ?? "en") as AgentLanguageId;
}

/** Text a client typed that goes into the AI's written brief. The gateway refuses text that looks like an attempt to override the AI ("system:", "ignore previous instructions"), so such patterns are defused rather than failing the whole setup. */
export function safeText(input: string, max = 600): string {
  return String(input ?? "")
    .replace(/[<>]/g, "")
    .replace(/\b(system|assistant|user)\s*:/gi, "$1 -")
    .replace(/\b(ignore|disregard)\s+((all|any)\s+)?(previous|prior|above)\b/gi, "$1 $4 (text removed)")
    .replace(/\b(new instructions?)\s*:/gi, "$1 -")
    .replace(/developer mode|jailbreak/gi, "")
    .replace(/\[INST\]|<<\s*SYS\s*>>/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * A phone number written the way people write it: spaces, dashes, brackets, a leading 00. Returns +CCNNN… with 8 to 15 digits, or null when it cannot be one.
 * A number without a country code is rejected on purpose: a transfer to the wrong country is worse than asking again.
 */
export function normalizeTransferNumber(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+")) return null;
  const body = digits.slice(1).replace(/\D/g, "");
  if (body.length < 8 || body.length > 15 || body.startsWith("0")) return null;
  return `+${body}`;
}

const DIALECT_NAME: Record<string, string> = {
  "ar-SA": "Saudi",
  "ar-AE": "Gulf (Khaleeji)",
  "ar-EG": "Egyptian",
  "ar-LB": "Levantine",
};

/** The first thing a caller hears. It says plainly that this is an AI receptionist, which the platform recommends everywhere. Arabic greetings use the chosen dialect. */
export function defaultGreeting(lang: AgentLanguageId, company: string, agentName: string): string {
  const c = safeText(company, 120) || "our office";
  const a = safeText(agentName, 60) || "Sarah";
  switch (lang) {
    case "ar-SA":
      return `هلا والله، شكراً لاتصالك بـ ${c}. معك ${a}، موظفة الاستقبال الذكية. كيف أقدر أخدمك؟`;
    case "ar-AE":
      return `هلا والله، شكراً لاتصالك بـ ${c}. معاك ${a}، موظفة الاستقبال الذكية. كيف أقدر أساعدك؟`;
    case "ar-EG":
      return `أهلاً بحضرتك، شكراً لاتصالك بـ ${c}. أنا ${a}، موظفة الاستقبال الذكية. أقدر أساعدك إزاي؟`;
    case "ar-LB":
      return `أهلاً وسهلاً، شكراً لاتصالك بـ ${c}. أنا ${a}، موظفة الاستقبال الذكية. كيف فيني ساعدك؟`;
    default:
      return `Hello, thank you for calling ${c}. This is ${a}, the AI receptionist. How can I help you today?`;
  }
}

const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeHours(days: string[], start: string, end: string, timezone: string): string {
  const open = DAY_ORDER.filter((d) => days.includes(d));
  if (open.length === 0) return `No regular opening days were given (timezone ${timezone}).`;
  return `Open ${open.join(", ")} from ${start} to ${end} (${timezone}).`;
}

/** The written brief that goes into the AI's custom instructions. Plain English for the model, whatever language the callers speak. */
export function buildInstructions(a: SetupAnswers): string {
  const company = safeText(a.company, 160);
  const out: string[] = [];
  out.push(`You are ${safeText(a.agentName, 60) || "the receptionist"}, the AI receptionist for ${company}.`);
  if (a.description.trim()) out.push(`About the business: ${safeText(a.description, 500)}`);
  if (a.services.length) out.push(`Services offered: ${a.services.map((s) => safeText(s, 80)).filter(Boolean).slice(0, 30).join(", ")}.`);
  out.push(`Opening hours: ${describeHours(a.days, a.start, a.end, a.timezone)}`);
  out.push(
    a.afterHours === "transfer" && normalizeTransferNumber(a.transferNumber)
      ? "When the office is closed: tell the caller the office is closed, take their name, number and reason, and offer to put urgent matters through to the on-call number."
      : "When the office is closed: tell the caller the office is closed, take their name, number and reason, and say the team will call back when it opens.",
  );
  if (a.urgent.trim()) {
    out.push(
      `Urgent matters, such as: ${safeText(a.urgent, 400)}. For these, collect the details quickly and ${normalizeTransferNumber(a.transferNumber) ? "transfer the call to the on-call number" : "say that the team will be told straight away"}.`,
    );
  }
  out.push(
    isArabicLanguage(a.language)
      ? `Speak natural ${DIALECT_NAME[a.language] ?? "Gulf"} Arabic by default. If the caller switches to English, another dialect or another language, answer in that.`
      : "Speak in clear English by default. If the caller switches to Arabic or another language, answer in that language.",
  );
  out.push("Always say you are an AI receptionist if asked. Always collect the caller's name and a phone number. Never invent prices, availability or policies: if you do not know, say you will pass the question to the team.");
  return out.join("\n");
}

export interface AiConfigPatch {
  agentName: string;
  greetingMessage: string;
  voice: string;
  language: string;
  tone: string;
  personality: string;
  transferPhoneNumber?: string;
  businessDescription?: string;
  servicesOffered: string[];
  customInstructions: string;
}

export interface SetupPayload {
  aiConfig: AiConfigPatch;
  tenantPatch: { default_language: string; transfer_phone_number: string | null };
  tenantCreate: { language_mode: string; voice_id: string };
}

/** Everything the wizard saves, in the shapes the gateway already accepts. */
export function buildSetupPayload(a: SetupAnswers): SetupPayload {
  const transfer = normalizeTransferNumber(a.transferNumber);
  const voice = VOICE_CHOICES.some((v) => v.id === a.voice) ? a.voice : DEFAULT_VOICE;
  const greeting = a.greeting.trim() ? safeText(a.greeting, 400) : defaultGreeting(a.language, a.company, a.agentName);
  return {
    aiConfig: {
      agentName: safeText(a.agentName, 60) || "Sarah",
      greetingMessage: greeting,
      voice,
      language: a.language,
      tone: a.tone,
      personality: a.tone,
      ...(transfer ? { transferPhoneNumber: transfer } : {}),
      ...(a.description.trim() ? { businessDescription: safeText(a.description, 500) } : {}),
      servicesOffered: a.services.map((s) => safeText(s, 80)).filter(Boolean).slice(0, 30),
      customInstructions: buildInstructions(a),
    },
    tenantPatch: { default_language: a.language, transfer_phone_number: transfer },
    tenantCreate: { language_mode: a.language, voice_id: voice },
  };
}

/** Industries most clients in the Gulf are in, in the order we show them. Anything else the platform offers follows under "More". */
export const GULF_INDUSTRY_PRIORITY = [
  "clinic",
  "dental",
  "real_estate",
  "law_firm",
  "property_management",
  "hvac",
  "restaurant",
  "auto_repair",
  "education",
  "insurance",
  "mortgage",
  "accounting",
  "general",
] as const;

export function orderIndustries<T extends { id: string; label: string }>(options: T[]): { popular: T[]; more: T[] } {
  const rank = new Map<string, number>(GULF_INDUSTRY_PRIORITY.map((id, i) => [id, i]));
  const popular = options.filter((o) => rank.has(o.id)).sort((x, y) => (rank.get(x.id) as number) - (rank.get(y.id) as number));
  const more = options.filter((o) => !rank.has(o.id)).sort((x, y) => x.label.localeCompare(y.label));
  return { popular, more };
}

/** The questions and answers a client pasted, as one text for the knowledge base. Empty when they pasted nothing useful. */
export function faqToKnowledgeText(input: string): string | null {
  const text = String(input ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  return text.length >= 10 ? text.slice(0, 20000) : null;
}
