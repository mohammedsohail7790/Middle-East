# Multilingual (EN / Saudi AR / HI / RU) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support exactly English, Arabic (Saudi colloquial), Hindi, and Russian across the AI voice agent, the dashboard app UI, and the public marketing landing page — dropping Spanish/French/Mandarin from the voice agent.

**Architecture:** Fix two drifted language lists in the gateway/dashboard that don't match the already-correct canonical `plan-config.ts` list. Extend `next-intl` locale routing with two new locale files. Rework the marketing site's binary `dir`-keyed lang-toggle CSS/JS into a 4-way `lang`-keyed scheme, update the sync script that hardcodes that scheme, then backfill translated copy.

**Tech Stack:** Next.js 15 / next-intl (dashboard), Node/Express-style gateway service (realtime voice prompts), static HTML/CSS/JS (marketing site), npm workspaces monorepo with a `precommit` hook running lint + typecheck across all workspaces.

## Global Constraints

- Voice agent languages: exactly `ar` (Saudi dialect), `en`, `hi`, `ru` — no `es`/`fr`/`zh`.
- Arabic **voice** output: Saudi colloquial dialect, not formal MSA.
- Arabic **written UI** (dashboard + marketing): formal written Arabic, not colloquial.
- Hindi/Russian translations: best-effort by the implementer, not professionally reviewed — do not block on native-speaker review.
- Marketing site source of truth is root-level `index.html`, `halla_preview.html`, `halla_styles.css`, `halla_main.js` (gitignored, not tracked in git) — edit these, never edit `Marketing site/*` or `apps/dashboard/public/*` directly, then run `node scripts/sync-halla-marketing.mjs` to publish.
- Every commit in this repo runs a `precommit` hook (`npm run lint && npm run typecheck` across all workspaces) — expect ~2 minutes per commit; do not use `--no-verify`.

---

### Task 1: Fix gateway voice-agent language list (Arabic Saudi dialect, drop es/fr/zh)

**Files:**
- Modify: `apps/gateway/src/services/realtime/receptionist-voice.ts:82-89` (`LANGUAGE_NAMES`)
- Modify: `apps/gateway/src/services/realtime/receptionist-voice.ts:178-185` (`PREVIEW_GREETING_BY_LANG`)

**Interfaces:**
- Consumes: nothing new — `resolveLanguageCode(language?: string): string` (existing, line 129) already truncates any input to a 2-char lowercase code and falls back to `'en'` if the code isn't a key of `LANGUAGE_NAMES`.
- Produces: `LANGUAGE_NAMES` now has keys `en | ar | hi | ru`. `getLanguageDisplayName`, `buildHumanRealtimePreamble`, `buildGreetingDeliveryHint`, `buildReceptionistRoleBlock`, `buildPreviewSampleText` (all existing, unchanged signatures) will now correctly resolve `ar` instead of silently falling back to English.

- [ ] **Step 1: Replace `LANGUAGE_NAMES`**

In `apps/gateway/src/services/realtime/receptionist-voice.ts`, replace lines 82-89:

```ts
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  ru: 'Russian',
  zh: 'Mandarin',
  hi: 'Hindi',
};
```

with:

```ts
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
};
```

- [ ] **Step 2: Add a Saudi-dialect-aware Arabic branch to the preamble builder**

In `apps/gateway/src/services/realtime/receptionist-voice.ts`, find `buildHumanRealtimePreamble` (around line 139). Replace the whole function:

```ts
export function buildHumanRealtimePreamble(language?: string): string {
  const code = resolveLanguageCode(language);
  if (code === 'en') {
    return HUMAN_REALTIME_PREAMBLE_EN;
  }

  const langName = getLanguageDisplayName(code);
  return `You are a real human receptionist on a live phone call — not a phone tree, not a narrator, not an AI.

Language (required — highest priority):
- Speak ONLY in ${langName} for the entire call unless the caller clearly switches to another language first.
- Sound like a native ${langName} speaker on a real business phone line — warm, natural, local rhythm.
- Do NOT use English accent or English phrases unless the caller uses English.

${HUMAN_DELIVERY_RULES}

${buildHumanSpeechAppendix()}`;
}
```

with:

```ts
export function buildHumanRealtimePreamble(language?: string): string {
  const code = resolveLanguageCode(language);
  if (code === 'en') {
    return HUMAN_REALTIME_PREAMBLE_EN;
  }

  if (code === 'ar') {
    return `You are a real human receptionist on a live phone call — not a phone tree, not a narrator, not an AI.

Language and dialect (required — highest priority):
- Speak ONLY in Saudi Arabic (اللهجة السعودية) — everyday colloquial Gulf/Saudi speech, the way a real front-desk receptionist in Riyadh or Jeddah talks. NOT Modern Standard Arabic (الفصحى), NOT a formal news-anchor register, NOT Egyptian/Levantine dialect.
- Use natural Saudi phrasing and filler words (يا هلا، حياك الله، تمام، إن شاء الله، أبشر، ثانية وحدة) where a real Saudi receptionist would.
- Do NOT use English accent or English phrases unless the caller uses English first.

${HUMAN_DELIVERY_RULES}

${buildHumanSpeechAppendix()}`;
  }

  const langName = getLanguageDisplayName(code);
  return `You are a real human receptionist on a live phone call — not a phone tree, not a narrator, not an AI.

Language (required — highest priority):
- Speak ONLY in ${langName} for the entire call unless the caller clearly switches to another language first.
- Sound like a native ${langName} speaker on a real business phone line — warm, natural, local rhythm.
- Do NOT use English accent or English phrases unless the caller uses English.

${HUMAN_DELIVERY_RULES}

${buildHumanSpeechAppendix()}`;
}
```

- [ ] **Step 3: Add a Saudi-dialect branch to the greeting delivery hint**

Find `buildGreetingDeliveryHint` (around line 158). Replace:

```ts
export function buildGreetingDeliveryHint(language?: string): string {
  const code = resolveLanguageCode(language);
  if (code === 'en') {
    return 'You literally just picked up a ringing phone — relaxed, warm, normal speaking speed, slight smile in your voice. Not announcer-voice, not customer-service script.';
  }
  return `You just picked up the phone — speak in ${getLanguageDisplayName(code)} only, warm and natural, normal pace (not announcer or robot).`;
}
```

with:

```ts
export function buildGreetingDeliveryHint(language?: string): string {
  const code = resolveLanguageCode(language);
  if (code === 'en') {
    return 'You literally just picked up a ringing phone — relaxed, warm, normal speaking speed, slight smile in your voice. Not announcer-voice, not customer-service script.';
  }
  if (code === 'ar') {
    return 'You just picked up the phone — speak in everyday Saudi colloquial Arabic only (not formal MSA), warm and natural, normal pace (not announcer or robot).';
  }
  return `You just picked up the phone — speak in ${getLanguageDisplayName(code)} only, warm and natural, normal pace (not announcer or robot).`;
}
```

- [ ] **Step 4: Add a Saudi-dialect branch to the role block builder**

Find `buildReceptionistRoleBlock` (around line 188). Replace the whole function:

```ts
export function buildReceptionistRoleBlock(options: {
  agentName: string;
  businessName: string;
  personalityDesc: string;
  language?: string;
}): string {
  const { agentName, businessName, personalityDesc } = options;
  const code = resolveLanguageCode(options.language);

  if (code === 'en') {
    return `You are ${agentName}, the receptionist at ${businessName} (New York area). ${personalityDesc}. You are a real person on the phone — not a bot. Speak natural New York English: direct, warm, conversational — never monotone or corporate. Use contractions and brief replies. One question at a time. Say "how can I help you" (never "what can I help you with"). Avoid menu-style lists and jargon.`;
  }

  const langName = getLanguageDisplayName(code);
  return `You are ${agentName}, the receptionist at ${businessName}. ${personalityDesc}. You are a real person on the phone — not a bot. Speak ONLY in ${langName} — native, warm, conversational phone manner. Never monotone or corporate. One question at a time. Use natural ${langName} phrasing for "how can I help you". Avoid menu-style lists and jargon. Never switch to English unless the caller does first.`;
}
```

with:

```ts
export function buildReceptionistRoleBlock(options: {
  agentName: string;
  businessName: string;
  personalityDesc: string;
  language?: string;
}): string {
  const { agentName, businessName, personalityDesc } = options;
  const code = resolveLanguageCode(options.language);

  if (code === 'en') {
    return `You are ${agentName}, the receptionist at ${businessName} (New York area). ${personalityDesc}. You are a real person on the phone — not a bot. Speak natural New York English: direct, warm, conversational — never monotone or corporate. Use contractions and brief replies. One question at a time. Say "how can I help you" (never "what can I help you with"). Avoid menu-style lists and jargon.`;
  }

  if (code === 'ar') {
    return `You are ${agentName}, the receptionist at ${businessName}. ${personalityDesc}. You are a real person on the phone — not a bot. Speak ONLY in everyday Saudi colloquial Arabic (اللهجة السعودية) — never Modern Standard Arabic, never a formal register. Native, warm, conversational Saudi phone manner. Never monotone or corporate. One question at a time. Avoid menu-style lists and jargon. Never switch to English unless the caller does first.`;
  }

  const langName = getLanguageDisplayName(code);
  return `You are ${agentName}, the receptionist at ${businessName}. ${personalityDesc}. You are a real person on the phone — not a bot. Speak ONLY in ${langName} — native, warm, conversational phone manner. Never monotone or corporate. One question at a time. Use natural ${langName} phrasing for "how can I help you". Avoid menu-style lists and jargon. Never switch to English unless the caller does first.`;
}
```

- [ ] **Step 5: Replace `PREVIEW_GREETING_BY_LANG`**

Replace lines 178-185:

```ts
const PREVIEW_GREETING_BY_LANG: Record<string, (agentName: string) => string> = {
  en: (agent) => `Thanks for calling. This is ${agent}. How can I help you?`,
  es: (agent) => `Gracias por llamar. Habla ${agent}. ¿En qué puedo ayudarle?`,
  fr: (agent) => `Merci d'avoir appelé. Ici ${agent}. Comment puis-je vous aider ?`,
  ru: (agent) => `Спасибо за звонок. Вас приветствует ${agent}. Чем могу помочь?`,
  zh: (agent) => `您好，感谢来电。我是${agent}。请问有什么可以帮您？`,
  hi: (agent) => `धन्यवाद, कॉल करने के लिए। मैं ${agent} बोल रहा हूँ। मैं आपकी कैसे मदद कर सकता हूँ?`,
};
```

with:

```ts
const PREVIEW_GREETING_BY_LANG: Record<string, (agentName: string) => string> = {
  en: (agent) => `Thanks for calling. This is ${agent}. How can I help you?`,
  ar: (agent) => `هلا والله، ${agent} تتكلم. كيف أقدر أخدمك؟`,
  ru: (agent) => `Спасибо за звонок. Вас приветствует ${agent}. Чем могу помочь?`,
  hi: (agent) => `धन्यवाद, कॉल करने के लिए। मैं ${agent} बोल रहा हूँ। मैं आपकी कैसे मदद कर सकता हूँ?`,
};
```

- [ ] **Step 6: Typecheck the gateway workspace**

Run: `cd "E:\Halla AI\apps\gateway" && npx tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
cd "E:\Halla AI"
git add apps/gateway/src/services/realtime/receptionist-voice.ts
git commit -m "fix: add Saudi-dialect Arabic to voice agent, drop es/fr/zh language support

LANGUAGE_NAMES was missing 'ar' entirely, so resolveLanguageCode()
silently fell back to English for any tenant configured with the
gateway's own canonical ar-SA language code. Adds Arabic with explicit
Saudi colloquial dialect instructions (not MSA) across the realtime
preamble, greeting hint, role block, and TTS preview greeting."
```

---

### Task 2: Fix dashboard agent-language picker to match gateway

**Files:**
- Modify: `apps/dashboard/src/lib/agent-languages.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AGENT_LANGUAGES: { id: string; name: string; flag: string }[]` and `AgentLanguageId` type — consumed by the agent settings page (`apps/dashboard/src/app/[locale]/dashboard/agent/page.tsx`) and `VoicePreviewPanel.tsx`, which read `.id`/`.name`/`.flag` off each entry; no signature change, only content changes, so no downstream edits needed.

- [ ] **Step 1: Replace the language list**

Replace the full contents of `apps/dashboard/src/lib/agent-languages.ts`:

```ts
/** Must stay aligned with gateway `SUPPORTED_LANGUAGES` / realtime receptionist. */
export const AGENT_LANGUAGES = [
  { id: "ar", name: "Arabic (Saudi)", flag: "🇸🇦" },
  { id: "en", name: "English", flag: "🇺🇸" },
  { id: "hi", name: "Hindi", flag: "🇮🇳" },
  { id: "ru", name: "Russian", flag: "🇷🇺" },
] as const;

export type AgentLanguageId = (typeof AGENT_LANGUAGES)[number]["id"];
```

- [ ] **Step 2: Typecheck the dashboard workspace**

Run: `cd "E:\Halla AI\apps\dashboard" && npx tsc --noEmit`
Expected: no output, exit code 0. (If any call site referenced a removed language id like `"es"`/`"fr"`/`"zh"` as a literal type, this will surface it — fix by widening to `string` at that call site only if it breaks; none are expected since `AgentLanguageId` was already a derived union.)

- [ ] **Step 3: Commit**

```bash
cd "E:\Halla AI"
git add apps/dashboard/src/lib/agent-languages.ts
git commit -m "fix: sync dashboard agent-language picker with gateway (ar/en/hi/ru)"
```

---

### Task 3: Add Hindi and Russian dashboard locales (next-intl)

**Files:**
- Modify: `apps/dashboard/src/i18n/routing.ts`
- Modify: `apps/dashboard/src/messages/en.json`
- Modify: `apps/dashboard/src/messages/ar.json`
- Create: `apps/dashboard/src/messages/hi.json`
- Create: `apps/dashboard/src/messages/ru.json`
- Modify: `apps/dashboard/src/app/[locale]/layout.tsx` (fonts)

**Interfaces:**
- Consumes: existing `en.json` structure (`navGroups`, `nav`, `shell` top-level keys) as the translation source.
- Produces: `routing.locales` includes `"hi"` and `"ru"`; every message file has identical key shape; `shell.hindi` / `shell.russian` keys added to all four files for Task 4's language switcher.

- [ ] **Step 1: Add the new locales to routing**

In `apps/dashboard/src/i18n/routing.ts`, replace:

```ts
export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
```

with:

```ts
export const routing = defineRouting({
  locales: ["en", "ar", "hi", "ru"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
```

- [ ] **Step 2: Add `shell.hindi` / `shell.russian` to `en.json` and `ar.json`**

In `apps/dashboard/src/messages/en.json`, the `"shell"` block currently ends:

```json
  "shell": {
    "loading": "Loading…",
    "retry": "Try again",
    "couldNotLoad": "Could not load data",
    "language": "Language",
    "english": "English",
    "arabic": "العربية"
  }
```

Replace with:

```json
  "shell": {
    "loading": "Loading…",
    "retry": "Try again",
    "couldNotLoad": "Could not load data",
    "language": "Language",
    "english": "English",
    "arabic": "العربية",
    "hindi": "हिन्दी",
    "russian": "Русский"
  }
```

In `apps/dashboard/src/messages/ar.json`, find the equivalent `"shell"` block and append the same two keys (`"hindi": "हिन्दी"`, `"russian": "Русский"` — language names are always shown in their own script regardless of UI locale) after its existing `"arabic"` entry, keeping that file's existing `loading`/`retry`/`couldNotLoad`/`language`/`english`/`arabic` values unchanged.

- [ ] **Step 3: Create `hi.json`**

Create `apps/dashboard/src/messages/hi.json`:

```json
{
  "navGroups": {
    "overview": "अवलोकन",
    "operations": "संचालन",
    "channels": "चैनल",
    "crm": "सीआरएम",
    "platform": "प्लेटफ़ॉर्म"
  },
  "nav": {
    "dashboard": "डैशबोर्ड",
    "dashboardSubtitle": "प्रदर्शन, वॉल्यूम और हाल की गतिविधि",
    "leads": "लीड्स",
    "leadsSubtitle": "पाइपलाइन चरण और रूपांतरण",
    "voiceAgents": "वॉइस एजेंट",
    "voiceAgentsSubtitle": "आवाज़, लहजा और रूटिंग नियम",
    "calendar": "कैलेंडर",
    "calendarSubtitle": "अपॉइंटमेंट और उपलब्धता",
    "analytics": "एनालिटिक्स",
    "analyticsSubtitle": "रुझान, फ़नल और केपीआई",
    "quality": "गुणवत्ता",
    "qualitySubtitle": "कॉल स्कोरिंग, सेंटीमेंट और लीड गुणवत्ता",
    "calls": "कॉल्स",
    "callsSubtitle": "ट्रांसक्रिप्ट, परिणाम और कॉल इतिहास",
    "outbound": "आउटबाउंड",
    "outboundSubtitle": "क्लिक-टू-कॉल, कैंपेन और रिमाइंडर",
    "sms": "एसएमएस",
    "smsSubtitle": "टेक्स्ट बातचीत और टेम्पलेट",
    "whatsapp": "व्हाट्सएप",
    "whatsappSubtitle": "व्हाट्सएप बिज़नेस बातचीत",
    "webChat": "वेब चैट",
    "webChatSubtitle": "वेबसाइट चैट विजेट बातचीत",
    "instagram": "इंस्टाग्राम",
    "instagramSubtitle": "इंस्टाग्राम डायरेक्ट बातचीत",
    "facebook": "फेसबुक",
    "facebookSubtitle": "फेसबुक मैसेंजर बातचीत",
    "crmPipeline": "पाइपलाइन",
    "crmPipelineSubtitle": "डील चरण और पाइपलाइन मूल्य",
    "crmContacts": "संपर्क",
    "crmContactsSubtitle": "आपके व्यवसाय से जुड़े लोग",
    "crmCompanies": "कंपनियाँ",
    "crmCompaniesSubtitle": "वे संगठन जिनके साथ आप व्यापार करते हैं",
    "crmDeals": "डील्स",
    "crmDealsSubtitle": "खुले और बंद अवसर",
    "integrations": "इंटीग्रेशन",
    "integrationsSubtitle": "सीआरएम, कैलेंडर और ऑटोमेशन",
    "automations": "ऑटोमेशन",
    "automationsSubtitle": "ट्रिगर-आधारित नियम और वर्कफ़्लो",
    "knowledgeBase": "नॉलेज बेस",
    "knowledgeBaseSubtitle": "कंपनी विवरण, सेवा क्षेत्र और एआई प्रशिक्षण सामग्री",
    "phoneNumbers": "फ़ोन नंबर",
    "phoneNumbersSubtitle": "इनबाउंड नंबर और रूटिंग",
    "compliance": "अनुपालन",
    "complianceSubtitle": "एआई प्रकटीकरण, कॉल रिकॉर्डिंग, रिटेंशन और ऑडिट लॉग",
    "billing": "बिलिंग",
    "billingSubtitle": "प्लान, उपयोग और इनवॉइस",
    "spamProtection": "स्पैम सुरक्षा",
    "spamProtectionSubtitle": "रोबोकॉल और अवांछित कॉलर्स को ब्लॉक करें",
    "support": "सहायता",
    "supportSubtitle": "मदद, दस्तावेज़ और संपर्क"
  },
  "shell": {
    "loading": "लोड हो रहा है…",
    "retry": "फिर से कोशिश करें",
    "couldNotLoad": "डेटा लोड नहीं हो सका",
    "language": "भाषा",
    "english": "English",
    "arabic": "العربية",
    "hindi": "हिन्दी",
    "russian": "Русский"
  }
}
```

- [ ] **Step 4: Create `ru.json`**

Create `apps/dashboard/src/messages/ru.json`:

```json
{
  "navGroups": {
    "overview": "Обзор",
    "operations": "Операции",
    "channels": "Каналы",
    "crm": "CRM",
    "platform": "Платформа"
  },
  "nav": {
    "dashboard": "Панель управления",
    "dashboardSubtitle": "Производительность, объём и последняя активность",
    "leads": "Лиды",
    "leadsSubtitle": "Этапы воронки и конверсия",
    "voiceAgents": "Голосовые агенты",
    "voiceAgentsSubtitle": "Голос, тон и правила маршрутизации",
    "calendar": "Календарь",
    "calendarSubtitle": "Встречи и доступность",
    "analytics": "Аналитика",
    "analyticsSubtitle": "Тренды, воронки и KPI",
    "quality": "Качество",
    "qualitySubtitle": "Оценка звонков, тональность и качество лидов",
    "calls": "Звонки",
    "callsSubtitle": "Транскрипты, результаты и история звонков",
    "outbound": "Исходящие",
    "outboundSubtitle": "Клик-звонок, кампании и напоминания",
    "sms": "SMS",
    "smsSubtitle": "Текстовые переписки и шаблоны",
    "whatsapp": "WhatsApp",
    "whatsappSubtitle": "Переписки WhatsApp Business",
    "webChat": "Веб-чат",
    "webChatSubtitle": "Переписки в чат-виджете сайта",
    "instagram": "Instagram",
    "instagramSubtitle": "Переписки Instagram Direct",
    "facebook": "Facebook",
    "facebookSubtitle": "Переписки Facebook Messenger",
    "crmPipeline": "Воронка",
    "crmPipelineSubtitle": "Этапы сделок и сумма воронки",
    "crmContacts": "Контакты",
    "crmContactsSubtitle": "Люди, связанные с вашим бизнесом",
    "crmCompanies": "Компании",
    "crmCompaniesSubtitle": "Организации, с которыми вы работаете",
    "crmDeals": "Сделки",
    "crmDealsSubtitle": "Открытые и закрытые сделки",
    "integrations": "Интеграции",
    "integrationsSubtitle": "CRM, календари и автоматизации",
    "automations": "Автоматизации",
    "automationsSubtitle": "Правила и рабочие процессы на основе триггеров",
    "knowledgeBase": "База знаний",
    "knowledgeBaseSubtitle": "Данные компании, зона обслуживания и материалы для обучения ИИ",
    "phoneNumbers": "Номера телефонов",
    "phoneNumbersSubtitle": "Входящие номера и маршрутизация",
    "compliance": "Соответствие требованиям",
    "complianceSubtitle": "Раскрытие информации об ИИ, запись звонков, хранение данных и журнал аудита",
    "billing": "Биллинг",
    "billingSubtitle": "Тариф, использование и счета",
    "spamProtection": "Защита от спама",
    "spamProtectionSubtitle": "Блокировка робозвонков и нежелательных абонентов",
    "support": "Поддержка",
    "supportSubtitle": "Помощь, документация и контакты"
  },
  "shell": {
    "loading": "Загрузка…",
    "retry": "Повторить",
    "couldNotLoad": "Не удалось загрузить данные",
    "language": "Язык",
    "english": "English",
    "arabic": "العربية",
    "hindi": "हिन्दी",
    "russian": "Русский"
  }
}
```

- [ ] **Step 5: Add font support for Devanagari and Cyrillic**

In `apps/dashboard/src/app/[locale]/layout.tsx`, find:

```ts
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
```
```ts
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
});
```

Replace with:

```ts
import { Inter, IBM_Plex_Sans_Arabic, Noto_Sans_Devanagari } from "next/font/google";
```
```ts
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
});
const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-devanagari",
});
```

Then find where `ibmPlexSansArabic.variable` is applied to the `<html>` or body className (search for `ibmPlexSansArabic.variable` in the same file) and add `notoSansDevanagari.variable` alongside it in the same className string, so the CSS variable is available regardless of active locale (the variable is only actually applied to text by CSS that scopes it to `[lang="hi"]`, added in Step 6).

- [ ] **Step 6: Scope the Devanagari font to Hindi via CSS**

In `apps/dashboard/src/app/globals.css`, add (near any existing `[lang="ar"]` or `.font-arabic` rule, or at the end of the file if none exists):

```css
[lang="hi"] {
  font-family: var(--font-devanagari), var(--font-sans), sans-serif;
}
```

- [ ] **Step 7: Build the dashboard to confirm all four locales generate**

Run: `cd "E:\Halla AI\apps\dashboard" && npm run build`
Expected: build succeeds; route table shows `/en/dashboard`, `/ar/dashboard`, `/hi/dashboard`, `/ru/dashboard` (and same for every other `[locale]` page) with no errors.

- [ ] **Step 8: Commit**

```bash
cd "E:\Halla AI"
git add apps/dashboard/src/i18n/routing.ts apps/dashboard/src/messages/en.json apps/dashboard/src/messages/ar.json apps/dashboard/src/messages/hi.json apps/dashboard/src/messages/ru.json "apps/dashboard/src/app/[locale]/layout.tsx" apps/dashboard/src/app/globals.css
git commit -m "feat: add Hindi and Russian dashboard locales

Adds hi/ru to next-intl routing with full nav/shell translations,
plus Devanagari font support scoped to [lang=\"hi\"] and the cyrillic
subset on the existing Inter font for Russian."
```

---

### Task 4: 4-way language switcher dropdown

**Files:**
- Modify: `apps/dashboard/src/components/dashboard/LanguageSwitcher.tsx`

**Interfaces:**
- Consumes: `routing.locales` (Task 3) now `["en", "ar", "hi", "ru"]`; `shell.english`/`shell.arabic`/`shell.hindi`/`shell.russian` keys (Task 3) from all four message files; existing `useLocale`, `useTranslations`, `usePathname`/`useRouter` from `@/i18n/navigation`.
- Produces: no new exports — same default export `LanguageSwitcher`, same usage site (wherever it's currently imported, unchanged).

- [ ] **Step 1: Replace the binary toggle with a dropdown**

Replace the full contents of `apps/dashboard/src/components/dashboard/LanguageSwitcher.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";

const LOCALES = ["en", "ar", "hi", "ru"] as const;
type Locale = (typeof LOCALES)[number];

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations("shell");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const labelFor: Record<Locale, string> = {
    en: t("english"),
    ar: t("arabic"),
    hi: t("hindi"),
    ru: t("russian"),
  };

  function select(next: Locale) {
    setOpen(false);
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-background-hover"
        aria-label={t("language")}
        aria-expanded={open}
      >
        <Globe className="size-4" strokeWidth={ICON_STROKE} />
        <span className={cn(locale === "ar" && "font-arabic")}>{labelFor[locale]}</span>
      </button>
      {open && (
        <div className="absolute end-0 mt-1 min-w-[140px] rounded-lg border border-border bg-background shadow-lg py-1 z-50">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => select(l)}
              className={cn(
                "w-full text-start px-3 py-1.5 text-sm hover:bg-background-hover transition-colors",
                l === "ar" && "font-arabic",
                l === locale ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              {labelFor[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "E:\Halla AI\apps\dashboard" && npx tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 3: Manual verification**

Run: `cd "E:\Halla AI\apps\dashboard" && npm run dev`, open `http://localhost:3000/en/login` (or any locale-prefixed public page with the switcher visible — check `DashboardTopbar.tsx` for where it's rendered if not visible on login), click the Globe icon, confirm all 4 languages listed and clicking each navigates and updates the label. Stop the dev server after (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
cd "E:\Halla AI"
git add apps/dashboard/src/components/dashboard/LanguageSwitcher.tsx
git commit -m "feat: expand language switcher from EN/AR toggle to 4-way dropdown"
```

---

### Task 5: Rework marketing site lang-toggle scheme (dir-keyed → lang-keyed) and update sync script

**Files:**
- Modify: `E:\Halla AI\halla_styles.css` (root, gitignored source of truth)
- Modify: `E:\Halla AI\halla_main.js` (root, gitignored source of truth)
- Modify: `E:\Halla AI\index.html` (root, gitignored source of truth) — nav toggle buttons only, not content
- Modify: `E:\Halla AI\scripts\sync-halla-marketing.mjs`

**Interfaces:**
- Consumes: none.
- Produces: CSS rule shape `.lang-en/.lang-ar/.lang-hi/.lang-ru { display: none }` + `html[lang="X"] .lang-X { display: inline }` (+ `.lang-block` variant `display: block`) — Task 6 relies on this exact class-naming convention (`lang-hi`, `lang-ru`) when adding translated spans. `setLang(lang)` now accepts any of `"en"|"ar"|"hi"|"ru"`.

- [ ] **Step 1: Confirm the root files are the ones being edited**

Run: `cd "E:\Halla AI" && git check-ignore -v index.html halla_styles.css halla_main.js`
Expected: all three print a match against `.gitignore` (confirms these are the untracked local source files, not `Marketing site/*` or `apps/dashboard/public/*`).

- [ ] **Step 2: Rework the CSS lang-toggle rules**

In `E:\Halla AI\halla_styles.css`, find the block (near line 579):

```css
.lang-ar { display: none; }
html[dir="rtl"] .lang-en,
#marketing-spa-root[dir="rtl"] .lang-en,
[dir="rtl"] .lang-en { display: none; }
html[dir="rtl"] .lang-ar,
#marketing-spa-root[dir="rtl"] .lang-ar,
[dir="rtl"] .lang-ar { display: inline; }
html[dir="rtl"] .lang-ar.lang-block,
#marketing-spa-root[dir="rtl"] .lang-ar.lang-block,
[dir="rtl"] .lang-ar.lang-block { display: block; }
```

Replace with:

```css
.lang-en, .lang-ar, .lang-hi, .lang-ru { display: none; }
html[lang="en"] .lang-en,
#marketing-spa-root[lang="en"] .lang-en,
[lang="en"] .lang-en { display: inline; }
html[lang="ar"] .lang-ar,
#marketing-spa-root[lang="ar"] .lang-ar,
[lang="ar"] .lang-ar { display: inline; }
html[lang="hi"] .lang-hi,
#marketing-spa-root[lang="hi"] .lang-hi,
[lang="hi"] .lang-hi { display: inline; }
html[lang="ru"] .lang-ru,
#marketing-spa-root[lang="ru"] .lang-ru,
[lang="ru"] .lang-ru { display: inline; }
html[lang="en"] .lang-en.lang-block,
#marketing-spa-root[lang="en"] .lang-en.lang-block,
[lang="en"] .lang-en.lang-block { display: block; }
html[lang="ar"] .lang-ar.lang-block,
#marketing-spa-root[lang="ar"] .lang-ar.lang-block,
[lang="ar"] .lang-ar.lang-block { display: block; }
html[lang="hi"] .lang-hi.lang-block,
#marketing-spa-root[lang="hi"] .lang-hi.lang-block,
[lang="hi"] .lang-hi.lang-block { display: block; }
html[lang="ru"] .lang-ru.lang-block,
#marketing-spa-root[lang="ru"] .lang-ru.lang-block,
[lang="ru"] .lang-ru.lang-block { display: block; }
```

- [ ] **Step 3: Rework `setLang()` in the marketing JS**

In `E:\Halla AI\halla_main.js`, find (around line 205):

```js
function setLang(lang) {
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const htmlLang = isAr ? 'ar' : 'en';
  const html = document.documentElement;
  html.setAttribute('dir', dir);
  html.setAttribute('lang', htmlLang);
  const root = document.getElementById('marketing-spa-root');
  if (root) {
    root.setAttribute('dir', dir);
    root.setAttribute('lang', htmlLang);
  }
  document.querySelectorAll('.lang-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
  try { localStorage.setItem('halla_lang', lang); } catch (e) {}
}
```

Replace with:

```js
function setLang(lang) {
  const supported = ['en', 'ar', 'hi', 'ru'];
  const safeLang = supported.includes(lang) ? lang : 'en';
  const dir = safeLang === 'ar' ? 'rtl' : 'ltr';
  const html = document.documentElement;
  html.setAttribute('dir', dir);
  html.setAttribute('lang', safeLang);
  const root = document.getElementById('marketing-spa-root');
  if (root) {
    root.setAttribute('dir', dir);
    root.setAttribute('lang', safeLang);
  }
  document.querySelectorAll('.lang-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === safeLang);
  });
  try { localStorage.setItem('halla_lang', safeLang); } catch (e) {}
}
```

And find the init block (around line 223):

```js
window.addEventListener('DOMContentLoaded', () => {
  calcROI();
  let savedLang = 'en';
  try { savedLang = localStorage.getItem('halla_lang') || 'en'; } catch (e) {}
  setLang(savedLang);
});
```

Leave this unchanged — `setLang` now internally validates `savedLang` against the 4 supported codes.

- [ ] **Step 4: Add HI/RU buttons to the nav lang-toggle**

In `E:\Halla AI\index.html`, find (around line 86):

```html
        <div class="lang-toggle">
          <button data-lang="en" onclick="setLang('en')" class="active">EN</button>
          <button data-lang="ar" onclick="setLang('ar')">عربي</button>
        </div>
```

Replace with:

```html
        <div class="lang-toggle">
          <button data-lang="en" onclick="setLang('en')" class="active">EN</button>
          <button data-lang="ar" onclick="setLang('ar')">عربي</button>
          <button data-lang="hi" onclick="setLang('hi')">हिं</button>
          <button data-lang="ru" onclick="setLang('ru')">RU</button>
        </div>
```

- [ ] **Step 5: Update the sync script's hardcoded CSS/JS injection to match**

In `E:\Halla AI\scripts\sync-halla-marketing.mjs`, replace `LANG_CSS_BLOCK` (lines 34-44):

```js
const LANG_CSS_BLOCK = `
.lang-ar { display: none; }
html[dir="rtl"] .lang-en,
#marketing-spa-root[dir="rtl"] .lang-en,
[dir="rtl"] .lang-en { display: none; }
html[dir="rtl"] .lang-ar,
#marketing-spa-root[dir="rtl"] .lang-ar,
[dir="rtl"] .lang-ar { display: inline; }
html[dir="rtl"] .lang-ar.lang-block,
#marketing-spa-root[dir="rtl"] .lang-ar.lang-block,
[dir="rtl"] .lang-ar.lang-block { display: block; }`;
```

with:

```js
const LANG_CSS_BLOCK = `
.lang-en, .lang-ar, .lang-hi, .lang-ru { display: none; }
html[lang="en"] .lang-en,
#marketing-spa-root[lang="en"] .lang-en,
[lang="en"] .lang-en { display: inline; }
html[lang="ar"] .lang-ar,
#marketing-spa-root[lang="ar"] .lang-ar,
[lang="ar"] .lang-ar { display: inline; }
html[lang="hi"] .lang-hi,
#marketing-spa-root[lang="hi"] .lang-hi,
[lang="hi"] .lang-hi { display: inline; }
html[lang="ru"] .lang-ru,
#marketing-spa-root[lang="ru"] .lang-ru,
[lang="ru"] .lang-ru { display: inline; }
html[lang="en"] .lang-en.lang-block,
#marketing-spa-root[lang="en"] .lang-en.lang-block,
[lang="en"] .lang-en.lang-block { display: block; }
html[lang="ar"] .lang-ar.lang-block,
#marketing-spa-root[lang="ar"] .lang-ar.lang-block,
[lang="ar"] .lang-ar.lang-block { display: block; }
html[lang="hi"] .lang-hi.lang-block,
#marketing-spa-root[lang="hi"] .lang-hi.lang-block,
[lang="hi"] .lang-hi.lang-block { display: block; }
html[lang="ru"] .lang-ru.lang-block,
#marketing-spa-root[lang="ru"] .lang-ru.lang-block,
[lang="ru"] .lang-ru.lang-block { display: block; }`;
```

Replace `LANG_CSS_PATTERN` (line 46-47):

```js
const LANG_CSS_PATTERN =
  /(?:\.lang-ar\s*\{\s*display:\s*none;\s*\}[\s\S]*?(?:html\[dir="rtl"\]\s*\.lang-ar\.lang-block|#marketing-spa-root\[dir="rtl"\]\s*\.lang-ar\.lang-block)[^{]*\{\s*display:\s*block;\s*\})/;
```

with:

```js
const LANG_CSS_PATTERN =
  /(?:\.lang-en,\s*\.lang-ar,\s*\.lang-hi,\s*\.lang-ru\s*\{\s*display:\s*none;\s*\}[\s\S]*?(?:html\[lang="ru"\]\s*\.lang-ru\.lang-block|#marketing-spa-root\[lang="ru"\]\s*\.lang-ru\.lang-block)[^{]*\{\s*display:\s*block;\s*\})/;
```

Replace `SETLANG_REPLACEMENT` (lines 49-65):

```js
const SETLANG_REPLACEMENT = `function setLang(lang) {
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const htmlLang = isAr ? 'ar' : 'en';
  const html = document.documentElement;
  html.setAttribute('dir', dir);
  html.setAttribute('lang', htmlLang);
  const root = document.getElementById('marketing-spa-root');
  if (root) {
    root.setAttribute('dir', dir);
    root.setAttribute('lang', htmlLang);
  }
  document.querySelectorAll('.lang-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
  try { localStorage.setItem('halla_lang', lang); } catch (e) {}
}`;
```

with:

```js
const SETLANG_REPLACEMENT = `function setLang(lang) {
  const supported = ['en', 'ar', 'hi', 'ru'];
  const safeLang = supported.includes(lang) ? lang : 'en';
  const dir = safeLang === 'ar' ? 'rtl' : 'ltr';
  const html = document.documentElement;
  html.setAttribute('dir', dir);
  html.setAttribute('lang', safeLang);
  const root = document.getElementById('marketing-spa-root');
  if (root) {
    root.setAttribute('dir', dir);
    root.setAttribute('lang', safeLang);
  }
  document.querySelectorAll('.lang-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === safeLang);
  });
  try { localStorage.setItem('halla_lang', safeLang); } catch (e) {}
}`;
```

Replace `SETLANG_PATTERN` (line 67):

```js
const SETLANG_PATTERN = /function setLang\(lang\)\s*\{[\s\S]*?try\s*\{\s*localStorage\.setItem\('halla_lang', lang\);\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\}\s*\}/;
```

with:

```js
const SETLANG_PATTERN = /function setLang\(lang\)\s*\{[\s\S]*?try\s*\{\s*localStorage\.setItem\('halla_lang', safeLang\);\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\}\s*\}/;
```

- [ ] **Step 6: Run the sync script and verify output**

Run: `cd "E:\Halla AI" && node scripts/sync-halla-marketing.mjs`
Expected output: `[sync-halla-marketing] Synced root → Marketing site + apps/dashboard/public` then `[sync-halla-marketing] Done.`

Then run: `grep -c "lang-hi\|lang-ru" "Marketing site/halla_styles.css" apps/dashboard/public/halla_styles.css`
Expected: both files show a non-zero count (confirms the new CSS block landed in both sync targets).

- [ ] **Step 7: Commit**

```bash
cd "E:\Halla AI"
git add scripts/sync-halla-marketing.mjs "Marketing site/halla_styles.css" "Marketing site/halla_main.js" "Marketing site/index.html" apps/dashboard/public/halla_styles.css apps/dashboard/public/halla_main.js apps/dashboard/public/marketing-body.html
git commit -m "feat: rework marketing site lang-toggle from dir-keyed binary to lang-keyed 4-way

The old scheme kept EN/AR apart via the dir (rtl/ltr) attribute, which
can't distinguish Hindi/Russian from English since all three are LTR.
Switches to a lang-attribute-keyed scheme supporting en/ar/hi/ru, and
updates the hardcoded CSS/JS the sync script injects on every build so
it doesn't clobber this back to binary."
```

(Root files `index.html`, `halla_styles.css`, `halla_main.js` are gitignored and won't show in `git status` — only the synced copies above are committed.)

---

### Task 6: Translate marketing landing page copy into Hindi and Russian

**Files:**
- Modify: `E:\Halla AI\index.html` (root, gitignored source of truth) — add `lang-hi`/`lang-ru` spans next to every existing `lang-en`/`lang-ar` pair
- Modify: `E:\Halla AI\halla_preview.html` (root, gitignored source of truth) — same treatment

**Interfaces:**
- Consumes: the `lang-hi`/`lang-ru` CSS class + `html[lang="X"]` selector scheme from Task 5.
- Produces: nothing consumed by later tasks — this is a leaf content task.

- [ ] **Step 1: Enumerate every existing lang-span pair in `index.html`**

Run: `cd "E:\Halla AI" && grep -n "lang-en\|lang-ar" index.html`

This prints every line with an existing `lang-en`/`lang-ar` span pair (46 pairs total, per the design spec's earlier count). For each line printed, add a `lang-hi` span immediately after the `lang-ar` span on that line (or immediately after the closing of the `lang-ar` block if multi-line), and a `lang-ru` span after that — translating the English text on that line into Hindi and Russian respectively. Preserve any inline HTML (`<br>`, `<em>`, `&nbsp;`) inside the translated text at the equivalent position. Preserve the `lang-block` class if present on the `lang-en`/`lang-ar` spans on that line (i.e. if the existing pair is `<span class="lang-en lang-block">` / `<span class="lang-ar lang-block">`, the new spans must be `<span class="lang-hi lang-block">` / `<span class="lang-ru lang-block">`).

Example transformation, given the existing line:

```html
<span class="lang-en">14-Day Free Trial — No Credit Card Required</span>
<span class="lang-ar">تجربة مجانية لمدة 14 يومًا — بدون بطاقة ائتمان</span>
```

becomes:

```html
<span class="lang-en">14-Day Free Trial — No Credit Card Required</span>
<span class="lang-ar">تجربة مجانية لمدة 14 يومًا — بدون بطاقة ائتمان</span>
<span class="lang-hi">14 दिन का मुफ़्त ट्रायल — क्रेडिट कार्ड की ज़रूरत नहीं</span>
<span class="lang-ru">14-дневный бесплатный период — банковская карта не нужна</span>
```

Work through all 46 pairs this way, in file order, translating the actual English source text for each (not the examples above — those are illustrative of the pattern only).

- [ ] **Step 2: Verify span-pair parity**

Run: `cd "E:\Halla AI" && grep -o "lang-en" index.html | wc -l && grep -o "lang-ar" index.html | wc -l && grep -o "lang-hi" index.html | wc -l && grep -o "lang-ru" index.html | wc -l`
Expected: all four counts are equal (46 each, or whatever the actual count is after Step 1 — they must match exactly, confirming no span was skipped).

- [ ] **Step 3: Repeat Steps 1-2 for `halla_preview.html`**

Run: `cd "E:\Halla AI" && grep -n "lang-en\|lang-ar" halla_preview.html` and apply the identical translation pass (45 pairs). Then verify parity: `grep -o "lang-en" halla_preview.html | wc -l && grep -o "lang-ar" halla_preview.html | wc -l && grep -o "lang-hi" halla_preview.html | wc -l && grep -o "lang-ru" halla_preview.html | wc -l` — all four counts equal.

- [ ] **Step 4: Sync and spot-check in a browser**

Run: `cd "E:\Halla AI" && node scripts/sync-halla-marketing.mjs`

Then run: `cd "E:\Halla AI\apps\dashboard" && npm run dev`, open `http://localhost:3000/` in a browser, click each of the 4 language toggle buttons in the nav, and confirm the hero heading and at least 2 other sections switch to the corresponding language with no leftover English/Arabic text showing through and no layout break (RTL only activates for Arabic). Stop the dev server after (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
cd "E:\Halla AI"
git add "Marketing site/index.html" "Marketing site/halla_preview.html" apps/dashboard/public/marketing-body.html
git commit -m "feat: translate marketing landing page copy into Hindi and Russian"
```

---

### Task 7: Final cross-workspace verification

**Files:** none (verification only)

- [ ] **Step 1: Full monorepo build**

Run: `cd "E:\Halla AI\apps\dashboard" && npm run build`
Expected: succeeds, route table includes `/hi/dashboard` and `/ru/dashboard` variants for every dashboard page (17 pages × 4 locales).

- [ ] **Step 2: Full monorepo lint + typecheck (same as precommit)**

Run: `cd "E:\Halla AI" && npm run lint && npm run typecheck`
Expected: no errors across `dashboard`, `gateway`, `worker`, `db`, `mcp-client`, `memory`, `types` workspaces.

- [ ] **Step 3: Confirm no leftover es/fr/zh references**

Run: `cd "E:\Halla AI" && grep -rn "'es'\|'fr'\|'zh'\|\"es\"\|\"fr\"\|\"zh\"" apps/gateway/src/services/realtime/receptionist-voice.ts apps/dashboard/src/lib/agent-languages.ts`
Expected: no matches (exit code 1 / empty output).

- [ ] **Step 4: Push**

Run: `cd "E:\Halla AI" && git push origin main` (only after the user confirms — this repo's workflow pattern from recent history is commit-then-explicit-push-request, so ask before running this step).
