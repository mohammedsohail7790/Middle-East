/**
 * Safety supervisor for live Medical Tourism calls (opt-in per tenant: voice_tenants.metadata.safety_supervisor.enabled = true).
 *
 * WHAT IT IS: two deterministic controls around the model, enforced in code rather than only requested in the prompt.
 *   1. Caller emergency detection. When the caller's transcribed words match an emergency pattern, the supervisor interrupts the
 *      conversation with a fixed emergency instruction (advise local emergency services, do not continue the commercial
 *      conversation, hand over to a human) and tells Klaros via lead.escalated.
 *   2. Assistant claim detection and correction. When the assistant's finished utterance matches a guarantee / diagnosis /
 *      prescription pattern, the supervisor makes the assistant retract it on the call and tells Klaros via lead.escalated so a
 *      human reviews the call.
 *
 * WHAT IT IS NOT: a preventive output guard. The live path is speech-to-speech: the assistant's transcript is final only after the
 * audio was spoken, so a bad sentence can be heard before it is detected. Detection is by keyword/phrase lists (English and Arabic
 * starter lists) that were NOT clinically or linguistically reviewed and are not exhaustive; a miss is possible and a false alarm is
 * possible. It reduces risk and creates a human-review trail; it is not evidence of medical safety. See readiness.ts.
 *
 * Privacy: nothing the caller or assistant said is logged or sent; only the category and ids.
 */

export type EmergencyCategory = 'chest_pain' | 'breathing' | 'bleeding' | 'unconscious' | 'stroke' | 'self_harm' | 'overdose' | 'seizure' | 'anaphylaxis';
export type UnsafeClaimCategory = 'guarantee' | 'diagnosis' | 'prescription';

/** Lower-case, strip Arabic diacritics/tatweel, unify alef/yaa/taa-marbuta forms, collapse spaces and punctuation. */
export function normalizeForMatching(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s%$]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const EMERGENCY: Array<[EmergencyCategory, RegExp]> = [
  ['chest_pain', /\b(chest pain|pain in (my |the )?chest|crushing (pain|pressure)|heart attack|my chest (hurts|is tight))\b|الم (في |ب)?(ال)?صدر|الم صدري|نوبه قلبيه|جلطه قلبيه/],
  ['breathing', /\b(can ?not|cant|can t|unable to|struggling to|trouble|difficulty|hard to) breath(e|ing)\b|\b(short(ness)? of breath|not breathing|stopped breathing|choking)\b|لا استطيع التنفس|صعوبه في التنفس|ضيق في التنفس|ضيق تنفس|اختناق/],
  ['bleeding', /\b(heavy|severe|uncontrolled|massive) bleeding\b|\bbleeding (heavily|a lot|badly|won t stop|will not stop)\b|\bwon t stop bleeding\b|نزيف (شديد|حاد|لا يتوقف)|دم كثير/],
  ['unconscious', /\b(unconscious|unresponsive|passed out|collapsed|lost consciousness|losing consciousness|fainted)\b|فقدان الوعي|فقد الوعي|اغمي عليه|اغمي علي|غيبوبه/],
  ['stroke', /\b(stroke|face (is )?drooping|slurred speech|sudden (numbness|weakness) (in|on))\b|سكته دماغيه|جلطه دماغيه|تلعثم في الكلام/],
  ['self_harm', /\b(suicid(e|al)|kill myself|end my life|want to die|hurt myself|harm myself|self harm)\b|انتحار|اريد ان اموت|اقتل نفسي|اوذي نفسي|انهي حياتي/],
  ['overdose', /\b(overdos(e|ed|ing)|took too many (pills|tablets|capsules))\b|جرعه زائده|ابتلعت حبوب كثيره/],
  ['seizure', /\b(seizure|convulsing|convulsion)\b|نوبه صرع|تشنجات|نوبه تشنج/],
  ['anaphylaxis', /\b(anaphyla\w*|throat (is )?(closing|swelling)|swelling of (my )?(throat|tongue|face))\b|صدمه تحسسيه|تورم (في )?(الحلق|اللسان|الوجه)/],
];

/** First emergency category the caller's words match, or null. Negations ("I have no chest pain") are NOT interpreted: when in doubt it escalates. */
export function detectEmergency(callerText: string): EmergencyCategory | null {
  const t = normalizeForMatching(callerText);
  if (!t) return null;
  for (const [category, re] of EMERGENCY) if (re.test(t)) return category;
  return null;
}

const UNSAFE: Array<[UnsafeClaimCategory, RegExp]> = [
  ['guarantee', /\b(i |we )?guarantee(d|s)?\b|\b100 ?% ?(safe|success|effective|certain)\b|\b(no|zero) risk\b|\brisk free\b|\bcompletely safe\b|\bwill (definitely|certainly|surely) (work|succeed|heal|recover|cure)\b|\bsuccess rate (is|of) \d+/],
  ['diagnosis', /\b(you (probably|likely|definitely|might|may) have|you have (a |an )?(\w+ ){0,3}(infection|disease|syndrome|disorder|cancer|diabetes|condition)|sounds like you have|looks like you have|your symptoms (suggest|indicate|mean|point to)|this is (probably|likely|most likely|definitely) (a |an )?\w+)\b/],
  ['prescription', /\b(you should take|you can take|i recommend (taking )?|i suggest (taking )?|try taking|take) ?\d* ?(mg|milligrams?|tablets?|pills?|capsules?|ibuprofen|paracetamol|acetaminophen|antibiotics?|aspirin|painkillers?)\b|\bstop taking (your )?(medication|medicine|pills)\b|\bincrease (your )?(dose|dosage)\b/],
];

/** First unsafe claim category in what the ASSISTANT just said, or null. */
export function detectUnsafeAssistantClaim(assistantText: string): UnsafeClaimCategory | null {
  const t = normalizeForMatching(assistantText);
  if (!t) return null;
  for (const [category, re] of UNSAFE) if (re.test(t)) return category;
  return null;
}

/** Fixed instruction injected when an emergency is detected. The model still speaks it (speech-to-speech); the wording is not left to its judgement. */
export const EMERGENCY_INSTRUCTION =
  'URGENT. The caller has just described what may be a medical emergency. Do not ask any question and do not talk about services, prices or bookings. ' +
  'In the caller\'s language, say calmly and briefly: this sounds urgent, they should contact their local emergency services right now, and you are alerting the team. ' +
  'Do not name an emergency number unless the business knowledge gives one. Do not give medical advice. Then call transfer_call with reason "emergency" and stay on the line.';

/** Fixed instruction injected when the assistant's last statement matched an unsafe-claim pattern. */
export const CORRECTION_INSTRUCTION =
  'CORRECTION REQUIRED. Your previous statement may have sounded like medical advice, a diagnosis, a medication instruction or a guarantee of results. ' +
  'Briefly retract it in the caller\'s language: say you are an AI assistant, you cannot give medical advice or guarantee outcomes, and a qualified professional or the team must answer that. ' +
  'Offer a human follow-up. Do not repeat the retracted statement.';

export interface SupervisedSession {
  id: string;
  tenantId: string;
  callSid: string;
  config: { safetySupervisor?: { enabled: boolean } };
  safety?: { emergencyHandled: boolean; corrections: number };
}

export interface SupervisorDeps {
  /** send a Realtime API client event to the model */
  send: (session: SupervisedSession, message: unknown) => void;
  /** tell Klaros (lead.escalated) that a human should look at this call; payload carries ids and a reason code only */
  escalate: (session: SupervisedSession, reason: string) => void;
  log: (event: 'SAFETY_EMERGENCY_DETECTED' | 'SAFETY_UNSAFE_CLAIM_DETECTED', fields: Record<string, unknown>) => void;
}

export const MAX_CORRECTIONS_PER_CALL = 3;

export function createSafetySupervisor(deps: SupervisorDeps) {
  const state = (s: SupervisedSession) => (s.safety ??= { emergencyHandled: false, corrections: 0 });
  const enabled = (s: SupervisedSession) => s.config?.safetySupervisor?.enabled === true;

  return {
    /** Call with each finished caller utterance. Returns the category it acted on, if any. */
    onCallerTranscript(session: SupervisedSession, text: string): EmergencyCategory | null {
      if (!enabled(session)) return null;
      const st = state(session);
      if (st.emergencyHandled) return null;
      const category = detectEmergency(text);
      if (!category) return null;
      st.emergencyHandled = true;
      deps.log('SAFETY_EMERGENCY_DETECTED', { sessionId: session.id, tenantId: session.tenantId, category });
      deps.send(session, { type: 'response.create', response: { instructions: EMERGENCY_INSTRUCTION } });
      deps.escalate(session, `emergency_${category}`);
      return category;
    },

    /** Call with each finished assistant utterance. Returns the category it acted on, if any. */
    onAssistantTranscript(session: SupervisedSession, text: string): UnsafeClaimCategory | null {
      if (!enabled(session)) return null;
      const st = state(session);
      const category = detectUnsafeAssistantClaim(text);
      if (!category) return null;
      deps.log('SAFETY_UNSAFE_CLAIM_DETECTED', { sessionId: session.id, tenantId: session.tenantId, category, corrected: st.corrections < MAX_CORRECTIONS_PER_CALL });
      deps.escalate(session, `unsafe_statement_${category}`);
      if (st.corrections < MAX_CORRECTIONS_PER_CALL) {
        st.corrections++;
        deps.send(session, { type: 'response.create', response: { instructions: CORRECTION_INSTRUCTION } });
      }
      return category;
    },
  };
}
