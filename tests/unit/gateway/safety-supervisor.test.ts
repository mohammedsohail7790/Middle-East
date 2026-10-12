/**
 * Safety supervisor (safety-supervisor.ts): deterministic emergency detection on the CALLER's words and unsafe-claim correction on
 * the ASSISTANT's words, behind a per-tenant opt-in. These tests prove the detectors and the wiring in the realtime session. They do
 * NOT prove medical safety: the phrase lists are starter lists that no clinician or native-speaker reviewer has signed off, the live
 * model was never exercised, and a keyword detector cannot be a complete safety control.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const published: Array<{ type: string; payload: Record<string, any>; tenantId: string }> = [];
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('../../../apps/gateway/src/events/event-publisher.js', () => ({
  publishPlatformEvent: vi.fn((type: string, payload: Record<string, any>, opts: { tenantId: string }) => { published.push({ type, payload, tenantId: opts.tenantId }); }),
}));
vi.mock('../../../apps/gateway/src/services/klaros/correlation.js', () => ({ resolveCallCorrelation: vi.fn(async () => ({})) }));

import {
  detectEmergency, detectUnsafeAssistantClaim, normalizeForMatching, createSafetySupervisor, EMERGENCY_INSTRUCTION, CORRECTION_INSTRUCTION,
  MAX_CORRECTIONS_PER_CALL, type SupervisedSession,
} from '../../../apps/gateway/src/services/realtime/safety-supervisor.js';
import { RealtimeSessionManager } from '../../../apps/gateway/src/services/realtime/realtime.session.js';

describe('detectEmergency: what the caller said', () => {
  it.each([
    ['I have chest pain and my arm is numb', 'chest_pain'],
    ["there's a crushing pressure in my chest", 'chest_pain'],
    ["I can't breathe properly", 'breathing'],
    ['he is struggling to breathe', 'breathing'],
    ['she has heavy bleeding after the procedure', 'bleeding'],
    ["the bleeding won't stop", 'bleeding'],
    ['my father passed out on the floor', 'unconscious'],
    ['I think it is a stroke, her face is drooping', 'stroke'],
    ['I want to kill myself', 'self_harm'],
    ["I've been thinking about suicide", 'self_harm'],
    ['I took too many pills', 'overdose'],
    ['he is having a seizure', 'seizure'],
    ['her throat is swelling after the injection', 'anaphylaxis'],
    ['عندي ألم في الصدر', 'chest_pain'],
    ['لا أستطيع التنفس', 'breathing'],
    ['هناك نزيف شديد', 'bleeding'],
    ['فقد الوعي فجأة', 'unconscious'],
    ['أريد أن أموت', 'self_harm'],
    ['حصلت له جرعة زائدة', 'overdose'],
    ['أصيب بنوبة صرع', 'seizure'],
  ])('%s -> %s', (text, category) => {
    expect(detectEmergency(text)).toBe(category);
  });

  it.each([
    'I am interested in a knee replacement next spring',
    'what is the cost of a dental consultation',
    'my appointment was moved to Tuesday',
    'I would like a callback in the evening',
    'أريد معلومات عن زراعة الشعر',
    'هل يمكنني الحجز الأسبوع القادم',
    '',
  ])('does not fire on an ordinary enquiry: %s', (text) => {
    expect(detectEmergency(text)).toBeNull();
  });

  it('is deliberately conservative: a negated mention still escalates (it does not try to interpret negation)', () => {
    expect(detectEmergency('I do not have any chest pain')).toBe('chest_pain');
  });

  it('normalizes Arabic variants and punctuation so spelling differences do not hide a match', () => {
    expect(normalizeForMatching('  أَلَمٌ في الصدر!! ')).toBe('الم في الصدر');
    expect(detectEmergency('نوبــة قلبيّة')).toBe('chest_pain');
  });
});

describe('detectUnsafeAssistantClaim: what the assistant said', () => {
  it.each([
    ['I guarantee you will be happy with the result', 'guarantee'],
    ['This procedure is 100% safe', 'guarantee'],
    ['There is no risk with this treatment', 'guarantee'],
    ['It will definitely work for you', 'guarantee'],
    ['You probably have an infection', 'diagnosis'],
    ['Your symptoms suggest a heart problem', 'diagnosis'],
    ['This is most likely a muscle strain', 'diagnosis'],
    ['You should take 400 mg of ibuprofen', 'prescription'],
    ['I recommend taking antibiotics', 'prescription'],
    ['You can stop taking your medication before you travel', 'prescription'],
  ])('%s -> %s', (text, category) => {
    expect(detectUnsafeAssistantClaim(text)).toBe(category);
  });

  it.each([
    'I am an AI assistant and I cannot give medical advice',
    'I do not have that information, I can have someone from the team come back to you',
    'The team will contact you about available dates',
    'Please speak to your doctor about that',
    'May I take your name and phone number',
    '',
  ])('does not fire on a safe statement: %s', (text) => {
    expect(detectUnsafeAssistantClaim(text)).toBeNull();
  });
});

describe('the supervisor', () => {
  const mk = (enabled: boolean | 'absent' = true) => {
    const sent: unknown[] = []; const escal: string[] = []; const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];
    const sup = createSafetySupervisor({ send: (_s, m) => sent.push(m), escalate: (_s, r) => escal.push(r), log: (event, fields) => logs.push({ event, fields }) });
    const session: SupervisedSession = { id: 's1', tenantId: 't1', callSid: 'CA1', config: enabled === 'absent' ? {} : { safetySupervisor: { enabled } } };
    return { sup, session, sent, escal, logs };
  };

  it('does nothing at all for a tenant that did not enable it', () => {
    for (const enabled of ['absent', false] as const) {
      const { sup, session, sent, escal } = mk(enabled);
      expect(sup.onCallerTranscript(session, 'I have chest pain')).toBeNull();
      expect(sup.onAssistantTranscript(session, 'I guarantee it')).toBeNull();
      expect(sent).toHaveLength(0); expect(escal).toHaveLength(0);
    }
  });

  it('an emergency interrupts with the fixed instruction and tells Klaros, once per call', () => {
    const { sup, session, sent, escal, logs } = mk();
    expect(sup.onCallerTranscript(session, 'I have chest pain')).toBe('chest_pain');
    expect(sent).toEqual([{ type: 'response.create', response: { instructions: EMERGENCY_INSTRUCTION } }]);
    expect(escal).toEqual(['emergency_chest_pain']);
    expect(sup.onCallerTranscript(session, 'it is getting worse, I cannot breathe')).toBeNull(); // already handled
    expect(sent).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: 'SAFETY_EMERGENCY_DETECTED', fields: { category: 'chest_pain' } });
  });

  it('what was said is never logged or sent: only the category and ids', () => {
    const { sup, session, sent, escal, logs } = mk();
    sup.onCallerTranscript(session, 'My name is Test Person and I have chest pain, my number is +971500000001');
    const everything = JSON.stringify({ sent, escal, logs });
    expect(everything).not.toMatch(/Test Person|971500000001|my name/i);
  });

  it('an unsafe assistant claim is retracted on the call and escalated for review, up to a cap', () => {
    const { sup, session, sent, escal } = mk();
    for (let i = 0; i < MAX_CORRECTIONS_PER_CALL + 2; i++) sup.onAssistantTranscript(session, 'I guarantee it will work');
    expect(sent).toHaveLength(MAX_CORRECTIONS_PER_CALL);
    expect(sent[0]).toEqual({ type: 'response.create', response: { instructions: CORRECTION_INSTRUCTION } });
    expect(escal).toHaveLength(MAX_CORRECTIONS_PER_CALL + 2); // every occurrence is still flagged for a human
    expect(escal[0]).toBe('unsafe_statement_guarantee');
  });

  it('a safe assistant statement changes nothing', () => {
    const { sup, session, sent, escal } = mk();
    expect(sup.onAssistantTranscript(session, 'I am an AI assistant and cannot give medical advice')).toBeNull();
    expect(sent).toHaveLength(0); expect(escal).toHaveLength(0);
  });
});

describe('wiring in the realtime session', () => {
  beforeEach(() => { published.length = 0; });
  const setup = (enabled: boolean) => {
    const manager = new RealtimeSessionManager();
    const sendSpy = vi.spyOn(manager, 'sendToOpenAI').mockImplementation(() => undefined);
    const session: any = { id: 's-wire', tenantId: 't1', callSid: 'CA-wire', isActive: true, transcriptLines: [], config: { language: 'en', safetySupervisor: enabled ? { enabled: true } : undefined } };
    const feed = (event: object) => (manager as any).handleOpenAIMessage(session, JSON.stringify(event));
    return { sendSpy, session, feed };
  };

  it('a caller emergency transcript event interrupts the call and publishes lead.escalated for human review', async () => {
    const { sendSpy, feed } = setup(true);
    feed({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'I have chest pain' });
    expect(sendSpy).toHaveBeenCalledWith(expect.anything(), { type: 'response.create', response: { instructions: EMERGENCY_INSTRUCTION } });
    await vi.waitFor(() => expect(published.filter((p) => p.type === 'LEAD_ESCALATED')).toHaveLength(1));
    expect(published[0]).toMatchObject({ tenantId: 't1', payload: { callId: 'CA-wire', target: 'human_review', reason: 'emergency_chest_pain' } });
    expect(JSON.stringify(published)).not.toMatch(/chest pain/i);
  });

  it('an unsafe assistant transcript event triggers a correction and a review escalation', async () => {
    const { sendSpy, feed } = setup(true);
    feed({ type: 'response.output_audio_transcript.done', transcript: 'You probably have an infection' });
    expect(sendSpy).toHaveBeenCalledWith(expect.anything(), { type: 'response.create', response: { instructions: CORRECTION_INSTRUCTION } });
    await vi.waitFor(() => expect(published.some((p) => p.payload.reason === 'unsafe_statement_diagnosis')).toBe(true));
  });

  it('with the supervisor not enabled the same events change nothing', () => {
    const { sendSpy, feed } = setup(false);
    feed({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'I have chest pain' });
    feed({ type: 'response.output_audio_transcript.done', transcript: 'I guarantee it' });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(published.filter((p) => p.type === 'LEAD_ESCALATED')).toHaveLength(0);
  });
});
