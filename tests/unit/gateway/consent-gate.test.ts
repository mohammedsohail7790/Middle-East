/**
 * Consent ENFORCEMENT for tenants that opted in to consent capture (consent-gate.ts) and where it is applied: create_lead, outbound
 * calls, and the escalation fallback. Database is an in-memory emulation of the few statements involved; this proves the gateway's
 * logic, not the SQL against PostgreSQL. A tenant that did NOT opt in must behave exactly as before in every case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const OPT_IN = '11111111-1111-4111-8111-111111111111';
const PLAIN = '22222222-2222-4222-8222-222222222222';
type Row = { tenant_id: string; call_sid: string | null; lead_id: string | null; scope: string; granted: boolean; at: number; seq: number };
const db = {
  optIn: new Set<string>([OPT_IN]),
  rows: [] as Row[],
  leads: [] as Array<{ id: string; tenant_id: string; phone: string }>,
  transferNumber: null as string | null,
  failConfig: false,
  failRows: false,
};
const published: Array<{ type: string; payload: Record<string, any>; tenantId: string }> = [];
const created: unknown[] = [];
/** escalation events only (the tool executor also publishes TOOL_EXECUTED for every tool call) */
const escalations = () => published.filter((p) => p.type === 'LEAD_ESCALATED');

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: vi.fn(async (sql: string, params: any[]) => {
      const t = sql.replace(/\s+/g, ' ').trim();
      if (t.startsWith("SELECT metadata->'consent_capture'")) {
        if (db.failConfig) throw new Error('connection terminated unexpectedly');
        return { rows: [{ consent_capture: db.optIn.has(params[0]) ? { wording_version: 'MT-CONSENT-v1' } : null }] };
      }
      if (t.startsWith('SELECT scope, granted, method, wording_version, recorded_at FROM public.lead_consents')) {
        if (db.failRows) throw new Error('connection terminated unexpectedly');
        const byLead = t.includes('lead_id = $2');
        return {
          rows: db.rows.filter((r) => r.tenant_id === params[0] && (byLead ? r.lead_id === params[1] : r.call_sid === params[1]))
            .sort((a, b) => a.at - b.at || a.seq - b.seq)
            .map((r) => ({ scope: r.scope, granted: r.granted, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: new Date(r.at) })),
        };
      }
      if (t.startsWith('SELECT id FROM public.leads WHERE tenant_id = $1 AND regexp_replace(phone')) {
        return { rows: db.leads.filter((l) => l.tenant_id === params[0] && l.phone.replace(/[^0-9+]/g, '') === params[1]).slice(0, 2).map((l) => ({ id: l.id })) };
      }
      if (t.startsWith('SELECT transfer_phone_number FROM public.voice_tenants')) return { rows: [{ transfer_phone_number: db.transferNumber }] };
      if (t.startsWith('select id from public.calls')) return { rows: [{ id: 'call-1' }] };
      if (t.startsWith('INSERT INTO public.calls')) return { rows: [] };
      throw new Error(`unexpected query in test fake: ${t}`);
    }),
  },
}));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('../../../apps/gateway/src/events/event-publisher.js', () => ({
  publishPlatformEvent: vi.fn((type: string, payload: Record<string, any>, opts: { tenantId: string }) => { published.push({ type, payload, tenantId: opts.tenantId }); }),
}));
vi.mock('../../../apps/gateway/src/services/klaros/correlation.js', () => ({ resolveCallCorrelation: vi.fn(async () => ({})) }));
vi.mock('../../../apps/gateway/src/services/leads/leads.service.js', () => ({ leadsService: { createLead: vi.fn(async (...a: unknown[]) => { created.push(a); return { id: 'lead-1' }; }) } }));
vi.mock('../../../apps/gateway/src/services/integrations/integration.service.js', () => ({ integrationService: { sendRealtime: vi.fn(async () => undefined) } }));
vi.mock('../../../apps/gateway/src/services/automation/automation.service.js', () => ({ automationService: { triggerLeadCreated: vi.fn(async () => undefined) } }));
const twilioCreate = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('twilio', () => ({ default: () => ({ calls: { create: vi.fn(async (a: unknown) => { twilioCreate.calls.push(a); return { sid: 'CA-OUT-1' }; }) } }) }));
vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({ voiceRedis: { setex: vi.fn(async () => 'OK'), get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), del: vi.fn(async () => 1) } }));
const transfer = vi.hoisted(() => ({ fail: false, calls: [] as unknown[] }));
vi.mock('../../../apps/gateway/src/services/voice/transfer.service.js', () => ({
  transferService: { transferCall: vi.fn(async (...a: unknown[]) => { transfer.calls.push(a); if (transfer.fail) throw new Error('twilio unavailable'); }) },
}));

import { getCallConsentGate, assertOutboundContactConsent, ConsentRequiredError, grantedScopesFromRows } from '../../../apps/gateway/src/services/consent/consent-gate.js';
import { RealtimeToolsManager } from '../../../apps/gateway/src/services/realtime/realtime.tools.js';
import { initiateOutboundCall } from '../../../apps/gateway/src/services/voice/outbound.service.js';
import { buildToolsList } from '../../../apps/gateway/src/services/realtime/realtime-tool-schemas.js';

const T0 = Date.parse('2026-10-09T10:00:00.000Z');
const decide = (tenant: string, call: string, scope: string, granted: boolean, s: number, leadId: string | null = null) =>
  db.rows.push({ tenant_id: tenant, call_sid: call, lead_id: leadId, scope, granted, at: T0 + s * 1000, seq: db.rows.length });
let seq = 0;
/** every call gets its own session id and call sid: the tool executor skips a repeat of the same tool within 30s of the same session */
const freshSid = () => `CA-${++seq}`;
const session = (tenantId: string, callSid: string) => ({ id: `s-${callSid}`, tenantId, callSid }) as never;

beforeEach(() => {
  db.optIn = new Set([OPT_IN]); db.rows.length = 0; db.leads.length = 0; db.transferNumber = null; db.failConfig = false; db.failRows = false;
  published.length = 0; created.length = 0; transfer.fail = false; transfer.calls.length = 0; twilioCreate.calls.length = 0;
});

describe('the call consent gate', () => {
  it('a tenant that did not opt in is not restricted at all', async () => {
    const g = await getCallConsentGate(PLAIN, 'CA1');
    expect(g.enforced).toBe(false);
    for (const s of ['contact', 'store_personal_data', 'store_medical_information'] as const) expect(g.allows(s)).toBe(true);
  });

  it('an opted-in tenant with no recorded decision is denied everything (pressing 1 / a call is not consent)', async () => {
    const g = await getCallConsentGate(OPT_IN, 'CA1');
    expect(g.enforced).toBe(true);
    for (const s of ['contact', 'store_personal_data', 'store_medical_information'] as const) expect(g.allows(s)).toBe(false);
  });

  it('allows exactly the granted scopes: contact does not imply personal data, personal data does not imply medical information', async () => {
    decide(OPT_IN, 'CA1', 'contact', true, 1);
    const g = await getCallConsentGate(OPT_IN, 'CA1');
    expect([g.allows('contact'), g.allows('store_personal_data'), g.allows('store_medical_information')]).toEqual([true, false, false]);
    decide(OPT_IN, 'CA1', 'store_personal_data', true, 2);
    const g2 = await getCallConsentGate(OPT_IN, 'CA1');
    expect([g2.allows('contact'), g2.allows('store_personal_data'), g2.allows('store_medical_information')]).toEqual([true, true, false]);
  });

  it('a withdrawal after a grant closes that scope again, and only that scope', async () => {
    decide(OPT_IN, 'CA1', 'contact', true, 1); decide(OPT_IN, 'CA1', 'store_personal_data', true, 1);
    decide(OPT_IN, 'CA1', 'store_personal_data', false, 2);
    const g = await getCallConsentGate(OPT_IN, 'CA1');
    expect([g.allows('contact'), g.allows('store_personal_data')]).toEqual([true, false]);
  });

  it('decisions of another call or another tenant never open this call', async () => {
    decide(OPT_IN, 'CA-OTHER', 'store_personal_data', true, 1);
    decide(PLAIN, 'CA1', 'store_personal_data', true, 1);
    expect((await getCallConsentGate(OPT_IN, 'CA1')).allows('store_personal_data')).toBe(false);
  });

  it('fails CLOSED: an unreadable configuration or unreadable decisions deny, and say the state was unavailable', async () => {
    db.failConfig = true;
    const a = await getCallConsentGate(OPT_IN, 'CA1');
    expect([a.enforced, a.unavailable, a.allows('store_personal_data')]).toEqual([true, true, false]);
    db.failConfig = false; db.failRows = true;
    const b = await getCallConsentGate(OPT_IN, 'CA1');
    expect([b.enforced, b.unavailable, b.allows('store_personal_data')]).toEqual([true, true, false]);
  });

  it('a call-less request is denied for an opted-in tenant', async () => {
    expect((await getCallConsentGate(OPT_IN, undefined)).allows('contact')).toBe(false);
  });

  it('grantedScopesFromRows ignores invalid rows and never widens', () => {
    expect(grantedScopesFromRows([{ scope: 'everything', granted: true, method: 'voice_ai_verbal', wording_version: 'v1', recorded_at: new Date(T0) }])).toEqual([]);
  });
});

describe('create_lead is refused without consent to store personal data (opted-in tenants only)', () => {
  const args = { name: 'Test Person', phone: '+971500000001', interest: 'knee consultation' };
  let sid = '';
  beforeEach(() => { sid = freshSid(); });

  it('refused with no decision: nothing is saved and the model is told not to collect more', async () => {
    const r = await new RealtimeToolsManager().executeToolDirect(session(OPT_IN, sid), 'create_lead', args);
    expect(r).toMatchObject({ success: false, error: 'consent_required' });
    expect(r.message).toMatch(/Nothing was saved/);
    expect(created).toHaveLength(0);
  });

  it('refused with only contact consent', async () => {
    decide(OPT_IN, sid, 'contact', true, 1);
    expect((await new RealtimeToolsManager().executeToolDirect(session(OPT_IN, sid), 'create_lead', args)).success).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('refused when personal-data consent was withdrawn, and when the consent state cannot be read', async () => {
    decide(OPT_IN, sid, 'store_personal_data', true, 1); decide(OPT_IN, sid, 'store_personal_data', false, 2);
    expect((await new RealtimeToolsManager().executeToolDirect(session(OPT_IN, sid), 'create_lead', args)).success).toBe(false);
    db.rows.length = 0; db.failRows = true;
    expect((await new RealtimeToolsManager().executeToolDirect(session(OPT_IN, freshSid()), 'create_lead', args)).success).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('allowed with granted store_personal_data for this call', async () => {
    decide(OPT_IN, sid, 'store_personal_data', true, 1);
    const r = await new RealtimeToolsManager().executeToolDirect(session(OPT_IN, sid), 'create_lead', args);
    expect(r.success).toBe(true);
    expect(created).toHaveLength(1);
  });

  it('a tenant that did not opt in saves leads exactly as before', async () => {
    const r = await new RealtimeToolsManager().executeToolDirect(session(PLAIN, sid), 'create_lead', args);
    expect(r.success).toBe(true);
    expect(created).toHaveLength(1);
  });
});

describe('outbound calls need a currently granted contact decision (opted-in tenants only)', () => {
  const lead = (id: string, tenant = OPT_IN, phone = '+971500000001') => db.leads.push({ id, tenant_id: tenant, phone });
  const code = async (to: string, tenant = OPT_IN) => assertOutboundContactConsent(tenant, to).then(() => 'ALLOWED', (e) => (e instanceof ConsentRequiredError ? e.code : `ERROR:${String(e)}`));

  it('a tenant that did not opt in is never restricted', async () => {
    expect(await code('+971500000001', PLAIN)).toBe('ALLOWED');
  });
  it('no lead for that number => refused', async () => { expect(await code('+971500000001')).toBe('no_lead'); });
  it('a lead with no decision => refused', async () => { lead('L1'); expect(await code('+971500000001')).toBe('no_contact_consent'); });
  it('personal-data consent alone is not contact consent', async () => {
    lead('L1'); decide(OPT_IN, 'CA1', 'store_personal_data', true, 1, 'L1');
    expect(await code('+971500000001')).toBe('no_contact_consent');
  });
  it('granted contact => allowed, also for a differently formatted number', async () => {
    lead('L1'); decide(OPT_IN, 'CA1', 'contact', true, 1, 'L1');
    expect(await code('+971500000001')).toBe('ALLOWED');
    expect(await code('+971 50 000 0001')).toBe('ALLOWED');
  });
  it('contact withdrawn later => refused', async () => {
    lead('L1'); decide(OPT_IN, 'CA1', 'contact', true, 1, 'L1'); decide(OPT_IN, 'CA2', 'contact', false, 5, 'L1');
    expect(await code('+971500000001')).toBe('no_contact_consent');
  });
  it('two leads with that number => refused (ambiguous)', async () => {
    lead('L1'); lead('L2'); decide(OPT_IN, 'CA1', 'contact', true, 1, 'L1');
    expect(await code('+971500000001')).toBe('ambiguous_lead');
  });
  it('another tenant\'s lead and consent never authorise this tenant', async () => {
    lead('L9', PLAIN); decide(PLAIN, 'CA1', 'contact', true, 1, 'L9');
    expect(await code('+971500000001')).toBe('no_lead');
  });
  it('a database error refuses', async () => {
    lead('L1'); decide(OPT_IN, 'CA1', 'contact', true, 1, 'L1'); db.failRows = true;
    expect(await code('+971500000001')).toBe('consent_state_unavailable');
    db.failRows = false; db.failConfig = true;
    expect(await code('+971500000001')).toBe('consent_state_unavailable');
  });
});

describe('escalation always has a destination for opted-in tenants', () => {
  const base = { capabilities: {}, transferPhoneNumber: undefined };
  let sid = '';
  beforeEach(() => { sid = freshSid(); });

  it('transfer_call is offered to an opted-in tenant even with no transfer number, and not to others', () => {
    const names = (c: object) => buildToolsList(c as never, 'professional').map((t) => t.name);
    expect(names({ ...base, consentCapture: { wordingVersion: 'v1' } })).toContain('transfer_call');
    expect(names(base)).not.toContain('transfer_call');
    expect(names({ ...base, transferPhoneNumber: '+10000000000' })).toContain('transfer_call');
  });

  it('no number: a call-back request is recorded (lead.escalated, target human_callback), no transfer is attempted, and the model is told not to claim a transfer', async () => {
    const r = await new RealtimeToolsManager().executeToolDirect(session(OPT_IN, sid), 'transfer_call', { reason: 'emergency' });
    expect(r).toMatchObject({ success: true, data: { mode: 'callback' } });
    expect(r.message).toMatch(/Do not say they are being transferred/);
    expect(transfer.calls).toHaveLength(0);
    await vi.waitFor(() => expect(escalations()).toHaveLength(1));
    expect(escalations()[0]).toMatchObject({ type: 'LEAD_ESCALATED', tenantId: OPT_IN, payload: { callId: sid, target: 'human_callback', reason: 'emergency' } });
    expect(Object.keys(escalations()[0].payload).sort()).toEqual(['callId', 'reason', 'target']);
  });

  it('a transfer that fails falls back to the same call-back record', async () => {
    db.transferNumber = '+15550100000'; transfer.fail = true;
    const r = await new RealtimeToolsManager().executeToolDirect(session(OPT_IN, sid), 'transfer_call', { reason: 'human_requested' });
    expect(r).toMatchObject({ success: true, data: { mode: 'callback' } });
    await vi.waitFor(() => expect(escalations()[0]?.payload.target).toBe('human_callback'));
  });

  it('a working transfer is unchanged: real transfer, lead.escalated carries the transfer target', async () => {
    db.transferNumber = '+15550100000';
    const r = await new RealtimeToolsManager().executeToolDirect(session(OPT_IN, sid), 'transfer_call', { reason: 'human_requested' });
    expect(r).toMatchObject({ success: true, data: { target: '+15550100000' } });
    expect(transfer.calls).toHaveLength(1);
    await vi.waitFor(() => expect(escalations()[0]?.payload.target).toBe('+15550100000'));
  });

  it('a tenant that did not opt in keeps the old behaviour: no number => error, no event', async () => {
    const r = await new RealtimeToolsManager().executeToolDirect(session(PLAIN, sid), 'transfer_call', { reason: 'x' });
    expect(r).toMatchObject({ success: false, error: 'No transfer number configured for this tenant.' });
    expect(escalations()).toHaveLength(0);
  });

  it('a transfer failure for a tenant that did not opt in still surfaces as a failure', async () => {
    db.transferNumber = '+15550100000'; transfer.fail = true;
    const r = await new RealtimeToolsManager().executeToolDirect(session(PLAIN, sid), 'transfer_call', { reason: 'x' });
    expect(r.success).toBe(false);
    expect(escalations()).toHaveLength(0);
  });
});

describe('the outbound call service itself enforces the contact decision (click-to-call, Klaros call-lead and campaigns all pass through it)', () => {
  const ctx = (tenantId: string) => ({ tenantId, toNumber: '+971500000001', fromNumber: '+15550100001', reason: 'follow_up' });

  it('an opted-in tenant: no consent => refused before Twilio is touched', async () => {
    db.leads.push({ id: 'L1', tenant_id: OPT_IN, phone: '+971500000001' });
    await expect(initiateOutboundCall(ctx(OPT_IN))).rejects.toMatchObject({ name: 'ConsentRequiredError', code: 'no_contact_consent' });
    expect(twilioCreate.calls).toHaveLength(0);
  });

  it('an opted-in tenant: granted contact => the call is placed', async () => {
    db.leads.push({ id: 'L1', tenant_id: OPT_IN, phone: '+971500000001' });
    decide(OPT_IN, 'CA-X', 'contact', true, 1, 'L1');
    await expect(initiateOutboundCall(ctx(OPT_IN))).resolves.toEqual({ callSid: 'CA-OUT-1' });
    expect(twilioCreate.calls).toHaveLength(1);
  });

  it('a tenant that did not opt in is unchanged: the call is placed with no consent record', async () => {
    await expect(initiateOutboundCall(ctx(PLAIN))).resolves.toEqual({ callSid: 'CA-OUT-1' });
    expect(twilioCreate.calls).toHaveLength(1);
  });
});
