/**
 * The REAL leadsService publishes lead.created / lead.updated platform events. These tests prove when a `consent` object is (and is
 * not) attached to them. voiceDb is a faked in-memory leads + lead_consents store; the event publisher, dashboard push, Slack and
 * CRM hooks are stubs. This is not a test against a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Consent = { tenant_id: string; call_sid: string | null; lead_id: string | null; scope: string; granted: boolean; method: string; wording_version: string; recorded_at: Date };
const T = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const store: { leads: Array<Record<string, any>>; consents: Consent[] } = { leads: [], consents: [] };
const published: Array<{ type: string; payload: Record<string, any>; tenantId: string }> = [];
let nextId = 1;

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: vi.fn(async (sql: string, params: any[]) => {
      const t = sql.replace(/\s+/g, ' ').trim();
      if (t.startsWith('SELECT id FROM public.leads WHERE tenant_id = $1 AND phone = $2')) {
        return { rows: store.leads.filter((l) => l.tenant_id === params[0] && l.phone === params[1]).map((l) => ({ id: l.id })) };
      }
      if (t.startsWith('INSERT INTO public.leads')) {
        const lead = { id: `lead-${nextId++}`, tenant_id: params[0], phone: params[1], name: params[2], source: params[3], status: 'new', score: params[4], notes: params[5], custom_fields: params[6], created_at: new Date() };
        store.leads.push(lead);
        return { rows: [lead] };
      }
      if (t.startsWith('UPDATE public.leads')) {
        const lead = store.leads.find((l) => l.id === params[t.includes('RETURNING') ? 6 : 6] && l.tenant_id === params[7]);
        return { rows: lead ? [lead] : [] };
      }
      if (t.startsWith('SELECT') && t.includes('FROM public.leads WHERE id = $1 AND tenant_id = $2')) {
        const lead = store.leads.find((l) => l.id === params[0] && l.tenant_id === params[1]);
        return { rows: lead ? [lead] : [] };
      }
      if (t.includes('lead_activities')) return { rows: [{ id: 'act-1', lead_id: params[0], type: params[1], description: params[2], metadata: null, created_at: new Date() }] };
      if (t.startsWith('UPDATE public.lead_consents SET lead_id')) {
        for (const c of store.consents) if (c.tenant_id === params[0] && c.call_sid === params[1] && c.lead_id === null) c.lead_id = params[2];
        return { rows: [] };
      }
      if (t.startsWith('SELECT scope, granted, method, wording_version, recorded_at FROM public.lead_consents')) {
        return { rows: store.consents.filter((c) => c.tenant_id === params[0] && c.lead_id === params[1]) };
      }
      return { rows: [] };
    }),
  },
}));
vi.mock('../../../apps/gateway/src/services/leads/leads-schema.js', () => ({ getLeadSelectList: async () => 'id, tenant_id, phone, name, source, status, score, notes, created_at, custom_fields' }));
vi.mock('../../../apps/gateway/src/services/dashboard/dashboard-events.js', () => ({ publishDashboardPushType: vi.fn() }));
vi.mock('../../../apps/gateway/src/services/slack/slack.service.js', () => ({ slackService: { sendNewLeadNotification: vi.fn(async () => undefined) } }));
vi.mock('../../../apps/gateway/src/services/integrations/integration.service.js', () => ({ integrationService: { sendRealtime: vi.fn(async () => undefined) } }));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../apps/gateway/src/events/event-publisher.js', () => ({
  publishPlatformEvent: vi.fn((type: string, payload: Record<string, any>, opts: { tenantId: string }) => { published.push({ type, payload, tenantId: opts.tenantId }); return Promise.resolve(); }),
}));

import { leadsService } from '../../../apps/gateway/src/services/leads/leads.service.js';

const consentRow = (o: Partial<Consent> = {}): Consent => ({ tenant_id: T, call_sid: 'CA1', lead_id: null, scope: 'contact', granted: true, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: new Date('2026-10-09T10:00:00.000Z'), ...o });
const settle = async (n: number) => { await vi.waitFor(() => expect(published.length).toBeGreaterThanOrEqual(n)); };

beforeEach(() => { store.leads = []; store.consents = []; published.length = 0; nextId = 1; });

describe('lead.created', () => {
  it('carries the consent object when explicit decisions were recorded on that call', async () => {
    store.consents = [consentRow({ scope: 'contact' }), consentRow({ scope: 'store_personal_data', recorded_at: new Date('2026-10-09T10:00:02.000Z') })];
    await leadsService.createLead(T, '+971500000001', 'inbound_call', { name: 'Test Person', consentCallSid: 'CA1' });
    await settle(1);
    expect(published[0].type).toBe('LEAD_CREATED');
    expect(published[0].payload.consent).toEqual({
      granted: true, scope: ['contact', 'store_personal_data'], method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: '2026-10-09T10:00:02.000Z',
    });
    expect(store.consents.every((c) => c.lead_id === 'lead-1')).toBe(true);
  });

  it('has NO consent key at all when nothing was recorded (a call, a pressed 1 and a "consent required" setting are not records)', async () => {
    await leadsService.createLead(T, '+971500000002', 'inbound_call', { name: 'Test Person', consentCallSid: 'CA1' });
    await settle(1);
    expect(Object.prototype.hasOwnProperty.call(published[0].payload, 'consent')).toBe(false);
  });

  it('a declined decision is reported as granted:false, never as a grant', async () => {
    store.consents = [consentRow({ scope: 'store_personal_data', granted: false })];
    await leadsService.createLead(T, '+971500000003', 'inbound_call', { name: 'Test Person', consentCallSid: 'CA1' });
    await settle(1);
    expect(published[0].payload.consent).toMatchObject({ granted: false, scope: ['store_personal_data'] });
  });

  it('a lead created without the call (API / dashboard) is not linked to anyone\'s call consent', async () => {
    store.consents = [consentRow()];
    await leadsService.createLead(T, '+971500000004', 'api', { name: 'Test Person' });
    await settle(1);
    expect('consent' in published[0].payload).toBe(false);
    expect(store.consents[0].lead_id).toBeNull();
  });

  it('another tenant\'s call decisions are never attached', async () => {
    store.consents = [consentRow({ tenant_id: OTHER })];
    await leadsService.createLead(T, '+971500000005', 'inbound_call', { name: 'Test Person', consentCallSid: 'CA1' });
    await settle(1);
    expect('consent' in published[0].payload).toBe(false);
    expect(store.consents[0].lead_id).toBeNull();
  });

  it('the rest of the event is unchanged: same fields as before for a tenant without consent capture', async () => {
    await leadsService.createLead(T, '+971500000006', 'inbound_call', { name: 'Test Person', callId: 'call-1', klarosLeadId: 'K1' });
    await settle(1);
    expect(Object.keys(published[0].payload).sort()).toEqual(['callId', 'klarosLeadId', 'leadId', 'name', 'phone']);
  });
});

describe('lead.updated', () => {
  it('a second call by the same caller updates the existing lead and carries that call\'s consent', async () => {
    await leadsService.createLead(T, '+971500000007', 'inbound_call', { name: 'Test Person' });
    await settle(1);
    published.length = 0;
    store.consents = [consentRow({ call_sid: 'CA2' })];
    await leadsService.createLead(T, '+971500000007', 'inbound_call', { name: 'Test Person', callId: 'call-2', consentCallSid: 'CA2' });
    await settle(1);
    expect(published[0].type).toBe('LEAD_UPDATED');
    expect(published[0].payload.consent).toMatchObject({ granted: true, scope: ['contact'] });
  });

  it('updateLead reports the lead\'s current evidence, including a later withdrawal', async () => {
    const lead = await leadsService.createLead(T, '+971500000008', 'inbound_call', { name: 'Test Person' });
    await settle(1);
    published.length = 0;
    store.consents = [
      consentRow({ lead_id: lead.id, scope: 'contact' }),
      consentRow({ lead_id: lead.id, scope: 'contact', granted: false, recorded_at: new Date('2026-10-09T10:05:00.000Z') }),
    ];
    await leadsService.updateLead(T, lead.id, { notes: 'follow-up note' });
    await settle(1);
    expect(published[0].type).toBe('LEAD_UPDATED');
    expect(published[0].payload.consent).toMatchObject({ granted: false, scope: ['contact'] });
  });

  it('updateLead with no recorded consent carries none', async () => {
    const lead = await leadsService.createLead(T, '+971500000009', 'inbound_call', { name: 'Test Person' });
    await settle(1);
    published.length = 0;
    await leadsService.updateLead(T, lead.id, { notes: 'x' });
    await settle(1);
    expect('consent' in published[0].payload).toBe(false);
  });
});
