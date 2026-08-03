/**
 * Shared copy and normalization for human-like phone receptionist behavior.
 */

export const DEFAULT_GREETING_TEMPLATE =
  'Thanks for calling {business}, this is {agent}. How can I help you?';

export function formatDefaultGreeting(businessName: string, agentName: string): string {
  return DEFAULT_GREETING_TEMPLATE.replace('{business}', businessName).replace(
    '{agent}',
    agentName
  );
}

/** Fix common robotic phrasing in stored greetings */
export function normalizeGreetingText(text: string): string {
  let s = text.trim();
  s = s.replace(/\bwhat can i help you with today\??/gi, 'how can I help you?');
  s = s.replace(/\bwhat can i help you with\??/gi, 'how can I help you?');
  s = s.replace(/\bwhat can i help you\b/gi, 'how can I help you');
  s = s.replace(/\bhow may i help you today\??/gi, 'how can I help you?');
  s = s.replace(/\bhow may i help you\??/gi, 'how can I help you?');
  return s;
}

/** Default OpenAI Realtime voice — Marin is optimized for natural phone conversation */
export const DEFAULT_REALTIME_VOICE = process.env.REALTIME_VOICE_DEFAULT || 'marin';

/** All built-in voices supported by gpt-realtime */
export const REALTIME_BUILTIN_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
] as const;

export type RealtimeBuiltinVoice = (typeof REALTIME_BUILTIN_VOICES)[number];

export function isRealtimeBuiltinVoice(voice: string): voice is RealtimeBuiltinVoice {
  return (REALTIME_BUILTIN_VOICES as readonly string[]).includes(voice);
}

/** OpenAI TTS (preview) supports a smaller voice set than Realtime */
const OPENAI_TTS_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
]);

/** Map Realtime voice ids to the closest TTS voice for dashboard preview */
export function mapVoiceForOpenAiTts(voice: string | undefined): string {
  const v = (voice || DEFAULT_REALTIME_VOICE).trim().toLowerCase();
  if (OPENAI_TTS_VOICES.has(v)) return v;
  const aliases: Record<string, string> = {
    marin: 'coral',
    cedar: 'onyx',
    verse: 'shimmer',
    // Legacy dashboard ids → TTS
    nova: 'nova',
    echo: 'echo',
    onyx: 'onyx',
  };
  return aliases[v] || 'coral';
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  ru: 'Russian',
  zh: 'Mandarin',
  hi: 'Hindi',
};

/** Shared delivery rules — language-agnostic */
const HUMAN_DELIVERY_RULES = `Voice and delivery (critical — this is a live human phone call):
- You are NOT a narrator, NOT a chatbot, NOT reading bullets. Sound like a real person who works the front desk.
- Vary pitch, pace, and energy naturally — never monotone, never evenly spaced "TTS rhythm".
- Keep replies SHORT: usually one sentence, two max. Then stop and let them talk.
- One question at a time. Never stack questions.
- Use contractions and casual phone English where natural (I'm, we're, yeah, okay, sure, got it, one sec, lemme check).
- Light backchannels when they're talking: "mm-hmm", "right", "okay" — only when natural, not every turn.
- Never sound like you're reading a script, listing options, or doing a phone tree.
- BANNED phrases (sound robotic): "How may I assist you", "I assist you with", "Thank you for calling [company] how can I direct your call", "Is there anything else I can help you with today", "I understand your concern", "Please hold while I", "As an AI", "Certainly!", "Absolutely!", "I'd be happy to help with that".
- Never say you are an AI, a bot, or mention tools/systems/APIs.
- If you need a moment, say "one sec" or "bear with me" like a human — not "please wait".`;

/** Appended to every live session — reinforces natural speech */
export function buildHumanSpeechAppendix(): string {
  return `CONVERSATION STYLE (always):
- Talk like you're on a handset, not presenting a webinar.
- Prefer simple words. No corporate jargon.
- Match the caller's energy — calm if they're calm, a bit quicker if they're in a hurry.
- Do not over-apologize or over-thank.
- Never repeat your name or the company name unless they ask.
- When unsure, ask one short clarifying question — don't guess and ramble.`;
}

/** English (NYC receptionist) — default for live calls */
export const HUMAN_REALTIME_PREAMBLE_EN = `You are a real human receptionist on a live phone call — not a phone tree, not a narrator, not an AI.

Language and accent (required):
- Speak American English with a natural New York City / tri-state phone manner — warm, direct, conversational.
- Not exaggerated, not a caricature. Not British, Southern, or flat "call center" English.

${HUMAN_DELIVERY_RULES}

${buildHumanSpeechAppendix()}`;

/** @deprecated use buildHumanRealtimePreamble */
export const HUMAN_REALTIME_PREAMBLE = HUMAN_REALTIME_PREAMBLE_EN;

export function resolveLanguageCode(language?: string): string {
  const code = (language || 'en').trim().toLowerCase().slice(0, 2);
  return LANGUAGE_NAMES[code] ? code : 'en';
}

export function getLanguageDisplayName(language?: string): string {
  return LANGUAGE_NAMES[resolveLanguageCode(language)] || 'English';
}

/** Realtime preamble matched to tenant language */
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

export function buildGreetingDeliveryHint(language?: string): string {
  const code = resolveLanguageCode(language);
  if (code === 'en') {
    return 'You literally just picked up a ringing phone — relaxed, warm, normal speaking speed, slight smile in your voice. Not announcer-voice, not customer-service script.';
  }
  return `You just picked up the phone — speak in ${getLanguageDisplayName(code)} only, warm and natural, normal pace (not announcer or robot).`;
}

/** Instructions for the first spoken line on a call */
export function buildGreetingSpeakInstruction(greeting: string, language?: string): string {
  const hint = buildGreetingDeliveryHint(language);
  const line = normalizeGreetingText(greeting);
  return `${hint}

Say this once, naturally (not word-for-word robotic if a tiny rephrase sounds more human): "${line}"

Then stop talking and listen for the caller. Do not add "how can I help you" if the greeting already asks that.`;
}

/** Natural spoken preview lines per language (for TTS test — must be in target language) */
const PREVIEW_GREETING_BY_LANG: Record<string, (agentName: string) => string> = {
  en: (agent) => `Thanks for calling. This is ${agent}. How can I help you?`,
  es: (agent) => `Gracias por llamar. Habla ${agent}. ¿En qué puedo ayudarle?`,
  fr: (agent) => `Merci d'avoir appelé. Ici ${agent}. Comment puis-je vous aider ?`,
  ru: (agent) => `Спасибо за звонок. Вас приветствует ${agent}. Чем могу помочь?`,
  zh: (agent) => `您好，感谢来电。我是${agent}。请问有什么可以帮您？`,
  hi: (agent) => `धन्यवाद, कॉल करने के लिए। मैं ${agent} बोल रहा हूँ। मैं आपकी कैसे मदद कर सकता हूँ?`,
};

/** Main role block for Realtime system prompt (language-aware) */
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

export function buildPreviewSampleText(options: {
  language?: string;
  agentName?: string;
  greetingMessage?: string;
}): string {
  const code = resolveLanguageCode(options.language);
  const agent = (options.agentName || 'Sarah').trim() || 'Sarah';
  const custom = options.greetingMessage?.trim();

  if (custom && code === 'en') {
    return normalizeGreetingText(custom.replace(/\[Agent\]/gi, agent));
  }

  if (custom && code !== 'en') {
    // Non-English with custom English greeting — use template in target language (caller should save localized greeting)
    return PREVIEW_GREETING_BY_LANG[code]?.(agent) ?? PREVIEW_GREETING_BY_LANG.en(agent);
  }

  return PREVIEW_GREETING_BY_LANG[code]?.(agent) ?? PREVIEW_GREETING_BY_LANG.en(agent);
}

export const GREETING_DELIVERY_HINT = buildGreetingDeliveryHint('en');

/** How to end calls naturally — injected into every live receptionist session */
export const CALL_CLOSING_RULES = `ENDING THE CALL (important):
- Never rush off the phone right after booking, transferring, or answering a question.
- After an appointment is booked: repeat the day and date and time once in plain words, ask if that works for them, wait for a clear yes, then one short warm sign-off (e.g. "Perfect — you're all set for Tuesday at two. See you then." or "Great, we'll see you then. Take care.").
- When they sound finished: one brief natural goodbye in your own words. Do NOT say "Is there anything else I can help you with today" or long corporate closings.
- If they say thanks or bye: echo briefly ("You got it, bye" / "Take care") and stop talking — let them hang up when possible.
- Do not keep prompting after you've already closed. Comfortable silence is fine for a second or two.
- Do not end the call in the same breath as the booking confirmation — give them a beat to react.
- Once you have said your goodbye out loud and the caller has nothing further, call end_call. Say the goodbye first, then call the tool — never call it before you've actually spoken your sign-off.`;

/** Emergency handling — always injected into receptionist prompts */
export const EMERGENCY_RECEPTIONIST_RULES = `EMERGENCIES (highest priority — never put these callers on hold to "take a message"):
- Life-threatening or urgent danger: gas smell or leak, carbon monoxide, fire/smoke, active flooding, downed power line, sparks, chest pain, stroke symptoms.
- Say clearly you are getting them help now. If transfer_call is available, use it immediately with reason "emergency".
- If you cannot transfer, tell them to hang up and call 911 if immediate danger, and stay on the line to capture their address and callback number.
- Do NOT run a normal booking script during an emergency — one short confirming question max, then transfer or escalate.`;

/** Default Realtime output speed — ~1.0 avoids sluggish "robotic" drag on gpt-realtime */
export const DEFAULT_SPEECH_SPEED = Number(process.env.REALTIME_SPEECH_SPEED || '1.0');

export function clampSpeechSpeed(rate: number | undefined): number {
  const n = rate ?? DEFAULT_SPEECH_SPEED;
  return Math.min(1.04, Math.max(0.92, n));
}

/** OpenAI TTS voice per onboarding/dashboard personality tone */
export const TONE_PREVIEW_VOICE: Record<string, string> = {
  professional: 'shimmer',
  friendly: 'coral',
  warm: 'coral',
  casual: 'ash',
  formal: 'shimmer',
};

/** Short script that showcases each personality for TTS preview */
export function buildTonePreviewSampleText(tone: string, agentName: string): string {
  const name = (agentName || 'Sarah').trim() || 'Sarah';
  const key = tone.toLowerCase();
  const scripts: Record<string, (n: string) => string> = {
    professional: (n) =>
      `Thank you for calling. This is ${n}. How may I assist you today?`,
    friendly: (n) =>
      `Hi, thanks for calling! I'm ${n}. What can I help you with?`,
    warm: (n) =>
      `Thank you so much for calling. This is ${n}. I'm happy to help — what do you need today?`,
    casual: (n) =>
      `Hey, you've got ${n}. What's going on? How can I help?`,
    formal: (n) =>
      `Good day. ${n} speaking. How may I direct your call?`,
  };
  return (scripts[key] ?? scripts.professional)(name);
}

/** Generate MP3 buffer via OpenAI TTS (dashboard + onboarding previews) */
export async function synthesizeOpenAiTtsMp3(
  text: string,
  voice: string
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Voice preview unavailable — OPENAI_API_KEY is not set on the gateway.');
  }

  const voiceId = mapVoiceForOpenAiTts(voice);
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || 'tts-1-hd',
      input: text.slice(0, 500),
      voice: voiceId,
      response_format: 'mp3',
      speed: DEFAULT_SPEECH_SPEED,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      detail ? `Voice preview failed: ${detail.slice(0, 200)}` : 'Voice preview failed'
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

/** Escape text for Twilio TwiML <Say> */
export function escapeTwimlSay(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Twilio Polly voice for instant phone greeting (plays while OpenAI connects) */
export const TWILIO_INSTANT_GREETING_VOICE =
  process.env.TWILIO_INSTANT_GREETING_VOICE || 'Polly.Joanna';

/** Spoken follow-up after a tool runs (Realtime needs response.create) */
export function buildPostToolSpeakInstruction(
  toolName: string,
  result: { success?: boolean; message?: string; data?: Record<string, unknown> }
): string | null {
  if (!result.success) {
    if (toolName === 'create_appointment' || toolName === 'reschedule_appointment') {
      return 'Tell the caller that time did not work. Offer another slot if you have one, or ask what time works better. Stay on the line.';
    }
    if (toolName === 'transfer_call') {
      return 'Apologize briefly that transfer failed and take their name and callback number.';
    }
    return 'Explain the issue in one short sentence and ask how they want to proceed.';
  }

  switch (toolName) {
    case 'create_appointment':
      return `Booking is confirmed. Say they're booked, repeat the appointment date and time clearly, ask "Does that work for you?" and wait. When they agree, give one short warm goodbye — not "anything else I can help you with today."`;
    case 'reschedule_appointment':
      return `Reschedule is confirmed. Repeat the new date and time, ask if that works, then a short warm goodbye when they're ready.`;
    case 'transfer_call':
      return `Say you're connecting them now in one short sentence, then stop talking while the transfer goes through.`;
    case 'cancel_appointment':
      return `Confirm the cancellation in one sentence, ask if they need anything else on this call, then close naturally when they're done.`;
    default:
      return null;
  }
}
