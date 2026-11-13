import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ emitTrigger: vi.fn(), isConsent: vi.fn() }));
vi.mock('../../apps/gateway/src/services/automation-engine/engine.js', () => ({ emitTrigger: m.emitTrigger }));
vi.mock('../../apps/gateway/src/services/whatsapp/whatsapp.outbound.js', () => ({ isConsentCaptureTenant: m.isConsent }));

import { emitAutomationTrigger, emitMissedCallFromStatus, sanitizeTriggerPayload } from '../../apps/gateway/src/services/automation-engine/triggers.js';

beforeEach(() => {
  vi.clearAllMocks();
  m.isConsent.mockResolvedValue(false);
});

describe('automation triggers', () => {
  it('passes only the allowed fields, cut short, never a transcript, and derives a score from the call rating', async () => {
    await emitAutomationTrigger('T', 'call.ended', 'CA1', { callerName: 'Sam', callerPhone: '+1', summary: 'x'.repeat(900), leadQuality: 'high', transcript: 'secret words', address: 'home' });
    const payload = m.emitTrigger.mock.calls[0][3];
    expect(payload).toMatchObject({ callerName: 'Sam', callerPhone: '+1', score: 85 });
    expect(payload.summary).toHaveLength(400);
    expect(JSON.stringify(payload)).not.toMatch(/secret words|home/);
    expect(m.emitTrigger.mock.calls[0].slice(0, 3)).toEqual(['T', 'call.ended', 'CA1']);
  });
  it('never emits for a consent-capture business, or when that cannot be told', async () => {
    m.isConsent.mockResolvedValue(true);
    await emitAutomationTrigger('T', 'lead.created', 'L1', { name: 'Sam' });
    expect(m.emitTrigger).not.toHaveBeenCalled();
  });
  it('never throws when the engine fails', async () => {
    m.emitTrigger.mockRejectedValue(new Error('engine down'));
    await expect(emitAutomationTrigger('T', 'lead.created', 'L1', {})).resolves.toBeUndefined();
    m.isConsent.mockRejectedValue(new Error('db down'));
    await expect(emitAutomationTrigger('T', 'lead.created', 'L1', {})).resolves.toBeUndefined();
    await expect(emitAutomationTrigger(undefined, 'lead.created', undefined, {})).resolves.toBeUndefined();
  });
  it('sanitize keeps numbers and drops empty strings', () => {
    expect(sanitizeTriggerPayload({ score: 40, name: '  ', email: ' a@b.co ' })).toEqual({ score: 40, email: 'a@b.co' });
  });
});

describe('missed call from the Twilio status callback', () => {
  const find = vi.fn(async () => ({ id: 'T' }));
  const body = (o: object) => ({ CallSid: 'CA9', Direction: 'inbound', To: '+971400000000', From: '+971501111111', ...o });
  it.each([['no-answer'], ['busy'], ['failed'], ['canceled']])('emits for %s', async (status) => {
    await emitMissedCallFromStatus(body({ CallStatus: status }), find);
    expect(m.emitTrigger).toHaveBeenCalledWith('T', 'call.missed', 'CA9', { callerPhone: '+971501111111', reason: status, callSid: 'CA9' });
  });
  it('emits for a call that hung up within seconds, not for a normal one, outbound dials, or an unknown number', async () => {
    await emitMissedCallFromStatus(body({ CallStatus: 'completed', CallDuration: '2' }), find);
    expect(m.emitTrigger).toHaveBeenCalledTimes(1);
    await emitMissedCallFromStatus(body({ CallStatus: 'completed', CallDuration: '120' }), find);
    await emitMissedCallFromStatus(body({ CallStatus: 'no-answer', Direction: 'outbound-api' }), find);
    await emitMissedCallFromStatus(body({ CallStatus: 'no-answer' }), async () => null);
    expect(m.emitTrigger).toHaveBeenCalledTimes(1);
  });
  it('never throws', async () => {
    await expect(emitMissedCallFromStatus(body({ CallStatus: 'no-answer' }), async () => { throw new Error('db'); })).resolves.toBeUndefined();
    await expect(emitMissedCallFromStatus(undefined, find)).resolves.toBeUndefined();
  });
});
