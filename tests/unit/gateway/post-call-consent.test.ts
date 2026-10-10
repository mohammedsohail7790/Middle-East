/**
 * What happens to a finished call's data when the tenant opted in to consent capture (finalizeRuntimeSession + consent-gate.ts):
 * nothing about the caller is processed, stored, synced or followed up without the matching decision; a tenant that did NOT opt in
 * behaves exactly as before. The database is an in-memory emulation of the consent statements; every other collaborator is a stub,
 * so this proves the gateway's decisions, not the behaviour of a real call, a real model or real PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const OPT_IN = '11111111-1111-4111-8111-111111111111';
const PLAIN = '22222222-2222-4222-8222-222222222222';
const rows: Array<{ tenant_id: string; call_sid: string; scope: string; granted: boolean; at: number; seq: number }> = [];
const calls = {
  storeCall: [] as any[], storeLead: [] as any[], sendRealtime: [] as any[], followUp: [] as any[], published: [] as any[], slack: [] as any[], evaluate: 0, extract: 0,
};

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: vi.fn(async (sql: string, params: any[]) => {
      const t = sql.replace(/\s+/g, ' ').trim();
      if (t.startsWith("SELECT metadata->'consent_capture'")) return { rows: [{ consent_capture: params[0] === OPT_IN ? { wording_version: 'MT-CONSENT-v1' } : null }] };
      if (t.startsWith('SELECT scope, granted, method, wording_version, recorded_at FROM public.lead_consents')) {
        return {
          rows: rows.filter((r) => r.tenant_id === params[0] && r.call_sid === params[1]).sort((a, b) => a.at - b.at || a.seq - b.seq)
            .map((r) => ({ scope: r.scope, granted: r.granted, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: new Date(r.at) })),
        };
      }
      return { rows: [] };
    }),
  },
}));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('../../../apps/gateway/src/services/voice/voice.controller.js', () => ({
  storeCall: vi.fn(async (a: any) => { calls.storeCall.push(a); }),
  storeLead: vi.fn(async (a: any) => { calls.storeLead.push(a); return 'lead-1'; }),
  resolveCallIdForLead: vi.fn(async () => 'call-uuid-1'),
}));
vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: { get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), del: vi.fn(async () => 1), srem: vi.fn(async () => 1), sadd: vi.fn(async () => 1), expire: vi.fn(async () => 1) },
}));
vi.mock('../../../apps/gateway/src/services/billing/billing.service.js', () => ({ billingService: { trackCallMinutes: vi.fn(async () => undefined) } }));
vi.mock('../../../apps/gateway/src/services/integrations/integration.service.js', () => ({ integrationService: { sendRealtime: vi.fn(async (...a: any[]) => { calls.sendRealtime.push(a); }) } }));
vi.mock('../../../apps/gateway/src/services/voice/concurrency.guard.js', () => ({ concurrencyGuard: { release: vi.fn(async () => undefined) } }));
vi.mock('../../../apps/gateway/src/services/realtime/session-coordinator.js', () => ({ sessionCoordinator: { unregisterSession: vi.fn(async () => undefined) } }));
vi.mock('../../../apps/gateway/src/services/realtime/heartbeat-manager.js', () => ({ heartbeatManager: { untrackSocket: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/ws-rate-limiter.js', () => ({ wsRateLimiter: { unregisterConnection: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/automation/automation.service.js', () => ({ automationService: { sendCallFollowUp: vi.fn(async (...a: any[]) => { calls.followUp.push(a); }) } }));
vi.mock('../../../apps/gateway/src/services/slack/slack.service.js', () => ({ slackService: { sendNewCallNotification: vi.fn(async (...a: any[]) => { calls.slack.push(a); }) } }));
vi.mock('../../../apps/gateway/src/services/qa/qa.service.js', () => ({ qaService: { recordAiEvaluation: vi.fn(async () => undefined) } }));
vi.mock('../../../apps/gateway/src/services/ai-config/ai-config.service.js', () => ({ aiConfigService: { getConfig: vi.fn(async () => ({ requiredFields: ['name', 'phone', 'service'] })) } }));
vi.mock('../../../apps/gateway/src/services/dashboard/dashboard-events.js', () => ({ publishDashboardPushType: vi.fn() }));
vi.mock('../../../apps/gateway/src/services/klaros/correlation.js', () => ({ resolveCallCorrelation: vi.fn(async () => ({})) }));
vi.mock('../../../apps/gateway/src/events/event-publisher.js', () => ({ publishPlatformEvent: vi.fn((type: string, payload: any) => { calls.published.push({ type, payload }); }) }));
vi.mock('../../../apps/gateway/src/events/platform-event-bus.js', () => ({ isP2AsyncIntegrationsEnabled: () => false }));
vi.mock('../../../apps/gateway/src/events/shadow-verification.js', () => ({ isP2ShadowVerificationEnabled: () => false, logShadowSyncBaseline: vi.fn() }));

import { finalizeRuntimeSession } from '../../../apps/gateway/src/services/realtime/realtime.post-call.js';

const T0 = Date.parse('2026-10-09T10:00:00.000Z');
const decide = (tenant: string, call: string, scope: string, granted = true) => rows.push({ tenant_id: tenant, call_sid: call, scope, granted, at: T0 + rows.length * 1000, seq: rows.length });
let n = 0;
const TRANSCRIPT = 'I had a knee operation last year and I take blood pressure tablets';

async function run(tenantId: string, callSid: string, opts: { consentDeclined?: boolean } = {}) {
  const session: any = {
    id: `s-${callSid}`, tenantId, callSid, config: { instructions: 'x', language: 'en' },
    transcriptLines: [{ role: 'caller', text: TRANSCRIPT }, { role: 'assistant', text: 'Thank you.' }],
  };
  const state: any = {
    sessionId: session.id, tenantId, callSid, callerPhone: '+971500000001', tenantConfig: { industry: 'x' },
    sessionManager: { getSession: () => session, closeSession: () => undefined }, consentDeclined: opts.consentDeclined,
  };
  const deps: any = {
    eventManager: { getSessionMetrics: () => ({ startTime: new Date(Date.now() - 60_000), toolCallCount: 0 }), sessionHadToolCall: () => false },
    memoryManager: { getAllSessionMemory: async () => [{ type: 'customer_info', key: 'name', value: 'Test Person' }, { type: 'customer_info', key: 'phone', value: '+971500000001' }], saveConversationSummary: vi.fn(async () => undefined) },
    analyticsManager: { trackEvent: vi.fn(async () => undefined) },
    aiService: {
      validateLeadExtraction: vi.fn(async () => { calls.extract++; return {}; }),
      evaluateCall: vi.fn(async () => { calls.evaluate++; return { sentiment: 'neutral', sentimentScore: 0, frustrationLevel: 0, callSuccess: true, leadQuality: 'high', summary: 's' }; }),
    },
  };
  await finalizeRuntimeSession(state, { terminate: () => undefined } as any, deps);
  // detached work (summary, follow-up, completion) settles on later ticks
  await new Promise((r) => setTimeout(r, 60));
  return { deps };
}

beforeEach(() => {
  rows.length = 0;
  for (const k of ['storeCall', 'storeLead', 'sendRealtime', 'followUp', 'published', 'slack'] as const) calls[k].length = 0;
  calls.evaluate = 0; calls.extract = 0;
});

describe('a tenant that did NOT opt in: unchanged', () => {
  it('stores the transcript and the lead, evaluates, syncs and follows up as before', async () => {
    const { deps } = await run(PLAIN, `CA-${++n}`);
    expect(calls.storeCall[0].transcript).toContain(TRANSCRIPT);
    expect(calls.storeLead).toHaveLength(1);
    expect(calls.evaluate).toBe(1);
    expect(calls.followUp).toHaveLength(1);
    expect(deps.memoryManager.saveConversationSummary.mock.calls[0][0]).toMatchObject({ customerName: 'Test Person', customerPhone: '+971500000001' });
  });
});

describe('an opted-in tenant: nothing without the matching decision', () => {
  it('no decision at all (a call happened, "press 1" was pressed): no lead, no AI processing of the transcript, no CRM sync, no follow-up, no Slack, no transcript, summary without personal data', async () => {
    const sid = `CA-${++n}`;
    const { deps } = await run(OPT_IN, sid);
    expect(calls.storeLead).toHaveLength(0);
    expect(calls.extract).toBe(0);
    expect(calls.evaluate).toBe(0);
    expect(calls.sendRealtime).toHaveLength(0);
    expect(calls.published.filter((p) => p.type === 'CRM_SYNC_REQUESTED')).toHaveLength(0);
    expect(calls.followUp).toHaveLength(0);
    expect(calls.slack).toHaveLength(0);
    expect(calls.storeCall[0].transcript).not.toContain('knee');
    expect(calls.storeCall[0].transcript).toMatch(/Transcript not stored/);
    expect(deps.memoryManager.saveConversationSummary.mock.calls[0][0]).toMatchObject({ customerName: undefined, customerPhone: undefined, primaryIntent: undefined, topics: [] });
    expect(JSON.stringify(calls.published)).not.toMatch(/971500000001|Test Person/);
  });

  it('the call itself is still recorded and call.completed is still published (only the personal data is withheld)', async () => {
    await run(OPT_IN, `CA-${++n}`);
    expect(calls.storeCall).toHaveLength(1);
    expect(calls.published.filter((p) => p.type === 'CALL_ENDED')).toHaveLength(1);
  });

  it('contact consent alone does not allow storing the person: no lead, but the follow-up (a contact) is allowed', async () => {
    const sid = `CA-${++n}`; decide(OPT_IN, sid, 'contact');
    await run(OPT_IN, sid);
    expect(calls.storeLead).toHaveLength(0);
    expect(calls.followUp).toHaveLength(1);
  });

  it('store_personal_data granted: the lead is stored and evaluated, but the transcript text is still not kept (medical information was not consented to)', async () => {
    const sid = `CA-${++n}`; decide(OPT_IN, sid, 'store_personal_data');
    await run(OPT_IN, sid);
    expect(calls.storeLead).toHaveLength(1);
    expect(calls.evaluate).toBe(1);
    expect(calls.storeCall[0].transcript).toMatch(/Transcript not stored/);
    expect(calls.followUp).toHaveLength(0); // no contact consent
  });

  it('store_personal_data + store_medical_information + contact granted: everything proceeds', async () => {
    const sid = `CA-${++n}`;
    for (const s of ['store_personal_data', 'store_medical_information', 'contact']) decide(OPT_IN, sid, s);
    await run(OPT_IN, sid);
    expect(calls.storeLead).toHaveLength(1);
    expect(calls.storeCall[0].transcript).toContain(TRANSCRIPT);
    expect(calls.followUp).toHaveLength(1);
  });

  it('a withdrawal after the grant takes effect before the call is archived', async () => {
    const sid = `CA-${++n}`;
    decide(OPT_IN, sid, 'store_personal_data'); decide(OPT_IN, sid, 'store_personal_data', false);
    await run(OPT_IN, sid);
    expect(calls.storeLead).toHaveLength(0);
  });

  it('another call\'s grant does not apply to this call', async () => {
    decide(OPT_IN, 'CA-OTHER', 'store_personal_data');
    await run(OPT_IN, `CA-${++n}`);
    expect(calls.storeLead).toHaveLength(0);
  });

  it('a caller who declined the recording prompt still never has a transcript stored (existing rule kept)', async () => {
    const sid = `CA-${++n}`;
    for (const s of ['store_personal_data', 'store_medical_information']) decide(OPT_IN, sid, s);
    await run(OPT_IN, sid, { consentDeclined: true });
    expect(calls.storeCall[0].transcript).toMatch(/Not recorded/);
  });
});
