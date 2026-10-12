/**
 * Publishing fresh consent evidence when record_consent stores a decision (apps/gateway/src/services/consent/consent-evidence.ts).
 * voiceDb is an in-memory fake of lead_consents; the event publisher is a stub. This proves the logic, not the SQL against a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { tenant_id: string; call_sid: string | null; lead_id: string | null; scope: string; granted: boolean; method: string; wording_version: string; recorded_at: Date };
const T = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
type Box = { id: number; tenant_id: string; call_sid: string; created_at: Date; delivered_at: Date | null; attempts: number; last_outcome: string | null };
const db: { rows: Row[]; box: Box[]; clock: number; failReads: boolean; failOutbox: boolean } = { rows: [], box: [], clock: Date.parse('2026-10-09T10:00:00.000Z'), failReads: false, failOutbox: false };
const bus: { up: boolean } = { up: true };
const published: Array<{ type: string; payload: Record<string, any>; ctx: Record<string, any> }> = [];

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: vi.fn(async (sql: string, p: any[]) => {
      const t = sql.replace(/\s+/g, ' ').trim();
      if (t.startsWith("SELECT metadata->'consent_capture'")) return { rows: [{ consent_capture: { wording_version: 'MT-CONSENT-v1' } }] };
      if (t.startsWith('INSERT INTO public.lead_consent_outbox')) {
        if (db.failOutbox) throw new Error('outbox down');
        db.box.push({ id: db.box.length + 1, tenant_id: p[0], call_sid: p[1], created_at: new Date(), delivered_at: null, attempts: 0, last_outcome: null });
        return { rows: [] };
      }
      if (t.startsWith('SELECT id, tenant_id, call_sid, created_at FROM public.lead_consent_outbox')) {
        const scoped = t.includes('AND tenant_id = $2');
        return { rows: db.box.filter((b) => !b.delivered_at && (!scoped || (b.tenant_id === p[1] && b.call_sid === p[2]))).slice(0, p[0]) };
      }
      if (t.startsWith('UPDATE public.lead_consent_outbox SET delivered_at')) { const b = db.box.find((x) => x.id === p[0])!; b.delivered_at = new Date(); b.attempts++; b.last_outcome = p[1]; return { rows: [] }; }
      if (t.startsWith('UPDATE public.lead_consent_outbox SET attempts')) { const b = db.box.find((x) => x.id === p[0])!; b.attempts++; b.last_outcome = p[1]; return { rows: [] }; }
      if (t.startsWith('WITH notify AS ( INSERT INTO public.lead_consent_outbox')) {
        if (db.failOutbox) throw new Error('outbox down');   // atomic: nothing at all is stored when the outbox part fails
        db.box.push({ id: db.box.length + 1, tenant_id: p[0], call_sid: p[1], created_at: new Date(), delivered_at: null, attempts: 0, last_outcome: null });
        for (const scope of p[2] as string[]) db.rows.push({ tenant_id: p[0], call_sid: p[1], lead_id: null, scope, granted: p[3], method: p[4], wording_version: p[5], recorded_at: new Date((db.clock += 1000)) });
        return { rows: [] };
      }
      if (t.startsWith('INSERT INTO public.lead_consents (tenant_id, lead_id, call_sid')) {
        for (const r of db.rows.filter((x) => x.tenant_id === p[0] && x.call_sid === p[1] && x.lead_id === null && !x.granted)) db.rows.push({ ...r, lead_id: p[2] });
        return { rows: [] };
      }
      if (t.startsWith('INSERT INTO public.lead_consents')) {
        db.rows.push({ tenant_id: p[0], call_sid: p[1], lead_id: null, scope: p[2], granted: p[3], method: p[4], wording_version: p[5], recorded_at: new Date((db.clock += 1000)) });
        return { rows: [] };
      }
      if (db.failReads && t.startsWith('SELECT')) throw new Error('db down');
      if (t.startsWith('SELECT DISTINCT lead_id')) {
        const ids = [...new Set(db.rows.filter((r) => r.tenant_id === p[0] && r.call_sid === p[1] && r.lead_id !== null).map((r) => r.lead_id))];
        return { rows: ids.map((lead_id) => ({ lead_id })) };
      }
      if (t.startsWith('UPDATE public.lead_consents SET lead_id')) {
        const refusalsOnly = t.includes('granted = FALSE');
        for (const r of db.rows) if (r.tenant_id === p[0] && r.call_sid === p[1] && r.lead_id === null && (!refusalsOnly || !r.granted)) r.lead_id = p[2];
        return { rows: [] };
      }
      if (t.startsWith('SELECT scope, granted, method, wording_version, recorded_at FROM public.lead_consents')) return { rows: db.rows.filter((r) => r.tenant_id === p[0] && r.lead_id === p[1]) };
      throw new Error(`unexpected query: ${t}`);
    }),
  },
}));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../apps/gateway/src/events/platform-event-bus.js', () => ({
  getPlatformEventBus: () => (bus.up ? { publish: vi.fn(async (type: string, payload: Record<string, any>, ctx: Record<string, any>) => { published.push({ type, payload, ctx }); return { eventId: `e${published.length}` }; }) } : null),
}));

import { CONSENT_OUTBOX_NO_LEAD_TTL_MS, deliverConsentChange, deriveConsentEvidence, flushConsentOutbox, recordConsentDecision } from '../../../apps/gateway/src/services/consent/consent-evidence.js';

/** What the Klaros receiver does with evidence (services/halla_consent.py): the newest `recorded_at` defines the whole state; ties are restrictive. */
type Ev = { granted: boolean; scope: string[]; recorded_at: string };
function klarosState(events: Ev[]): string[] {
  if (!events.length) return [];
  const newest = events.map((e) => e.recorded_at).sort().at(-1)!;
  let state: Set<string> | null = null;
  for (const e of events.filter((x) => x.recorded_at === newest)) {
    const mine = new Set(e.granted ? e.scope : []);
    state = state === null ? mine : new Set([...state].filter((x) => mine.has(x)));
  }
  return [...(state ?? [])].sort();
}
const consents = () => published.map((p) => p.payload.consent as Ev);
const decide = (decision: string, scopes: string[], tenant = T, call = 'CA1') => recordConsentDecision(tenant, call, { decision, scopes });
const linkLead = (lead = 'lead-1', tenant = T, call = 'CA1') => { for (const r of db.rows) if (r.tenant_id === tenant && r.call_sid === call && r.lead_id === null) r.lead_id = lead; };

beforeEach(() => { db.rows = []; db.box = []; db.clock = Date.parse('2026-10-09T10:00:00.000Z'); db.failReads = false; db.failOutbox = false; bus.up = true; published.length = 0; });

describe('recorded_at never moves backwards', () => {
  const row = (o: Partial<Record<string, any>>) => ({ scope: 'contact', granted: true, method: 'voice_ai_verbal', wording_version: 'v1', recorded_at: '2026-10-09T10:00:00.000Z', ...o });
  it('a partial withdrawal reports the time of the withdrawal, not the older grant that remains', () => {
    const t1 = '2026-10-09T10:00:00.000Z', t2 = '2026-10-09T11:00:00.000Z', t3 = '2026-10-09T12:00:00.000Z';
    const afterT2 = deriveConsentEvidence([row({ scope: 'store_personal_data', recorded_at: t1 }), row({ scope: 'contact', recorded_at: t2 })])!;
    const afterT3 = deriveConsentEvidence([row({ scope: 'store_personal_data', recorded_at: t1 }), row({ scope: 'contact', recorded_at: t2 }), row({ scope: 'contact', granted: false, recorded_at: t3 })])!;
    expect(afterT2).toMatchObject({ scope: ['contact', 'store_personal_data'], recorded_at: t2 });
    expect(afterT3).toMatchObject({ granted: true, scope: ['store_personal_data'], recorded_at: t3 });
    expect(afterT3.recorded_at > afterT2.recorded_at).toBe(true);
  });
});

describe('grant -> withdrawal -> re-grant', () => {
  async function run() {
    linkLead();
    // the lead already exists for this call, so rows become linked as soon as they are written (as createLead does for the first decision)
    await decide('granted', ['contact', 'store_personal_data']); expect(await deliverConsentChange(T, 'CA1')).toBe('published');
    await decide('withdrawn', ['contact']); expect(await deliverConsentChange(T, 'CA1')).toBe('published');
    await decide('granted', ['contact']); expect(await deliverConsentChange(T, 'CA1')).toBe('published');
  }
  beforeEach(() => { db.rows.push({ tenant_id: T, call_sid: 'CA1', lead_id: 'lead-1', scope: 'store_personal_data', granted: true, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: new Date(db.clock) }); });

  it('publishes one lead.updated per change, carrying only the ids and the freshly derived evidence', async () => {
    await run();
    expect(published.map((p) => p.type)).toEqual(['LEAD_UPDATED', 'LEAD_UPDATED', 'LEAD_UPDATED']);
    expect(published.every((p) => p.ctx.callSid === 'CA1')).toBe(true);
    expect(published.every((p) => Object.keys(p.payload).sort().join() === 'consent,leadId' && p.payload.leadId === 'lead-1' && p.ctx.tenantId === T)).toBe(true);
    const [a, b, c] = consents();
    expect(a).toMatchObject({ granted: true, scope: ['contact', 'store_personal_data'] });
    expect(b).toMatchObject({ granted: true, scope: ['store_personal_data'] });  // contact withdrawn: no longer listed
    expect(c).toMatchObject({ granted: true, scope: ['contact', 'store_personal_data'] });  // re-granted
    expect(a.recorded_at < b.recorded_at && b.recorded_at < c.recorded_at).toBe(true);
  });

  it('a receiver that orders by recorded_at ends in the true state for EVERY delivery order and for repeated delivery', async () => {
    await run();
    const evs = consents();
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const order of perms) {
      expect(klarosState(order.map((i) => evs[i]))).toEqual(['contact', 'store_personal_data']);
      expect(klarosState([...order, ...order].map((i) => evs[i]))).toEqual(['contact', 'store_personal_data']);  // every event delivered twice
    }
    // stopping after the withdrawal, any order of the first two events still yields the withdrawn state (the old grant cannot be restored)
    expect(klarosState([evs[1], evs[0]])).toEqual(['store_personal_data']);
    expect(klarosState([evs[0], evs[1], evs[0], evs[0]])).toEqual(['store_personal_data']);
  });

  it('with the old (non-monotonic) recorded_at the same withdrawal would have been lost -- the regression this fixes', () => {
    const e2: Ev = { granted: true, scope: ['contact', 'store_personal_data'], recorded_at: '2026-10-09T11:00:00.000Z' };
    const e3old: Ev = { granted: true, scope: ['store_personal_data'], recorded_at: '2026-10-09T10:00:00.000Z' };  // old derivation: time of the remaining grant
    expect(klarosState([e2, e3old])).toEqual(['contact', 'store_personal_data']);  // withdrawal ignored as stale
  });

  it('publishing again with no new decision repeats the same evidence (same state, nothing invented)', async () => {
    await decide('withdrawn', ['contact']);
    await deliverConsentChange(T, 'CA1'); await deliverConsentChange(T, 'CA1');
    expect(consents()[0]).toEqual(consents()[1]);
  });

  it('there is no ordinary lead update in between: the change alone produces the event', async () => {
    await decide('withdrawn', ['contact']);
    expect(published).toHaveLength(0);  // recording by itself publishes nothing; the tool handler flushes the outbox
    await deliverConsentChange(T, 'CA1');
    expect(published).toHaveLength(1);
    expect(klarosState(consents())).toEqual(['store_personal_data']);
  });
});

describe('what is NOT published', () => {
  it('no lead linked to the call yet: nothing (the lead creation event will carry the evidence)', async () => {
    await decide('granted', ['contact']);
    expect(await deliverConsentChange(T, 'CA1')).toBe('no_lead_yet');
    expect(published).toHaveLength(0);
  });
  it('a decision on another tenant with the same call id is never linked or published for this tenant', async () => {
    db.rows.push({ tenant_id: OTHER, call_sid: 'CA1', lead_id: 'lead-x', scope: 'contact', granted: true, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: new Date(db.clock) });
    await decide('granted', ['contact']);
    expect(await deliverConsentChange(T, 'CA1')).toBe('no_lead_yet');
    expect(published).toHaveLength(0);
    expect(db.rows.find((r) => r.tenant_id === OTHER)!.lead_id).toBe('lead-x');
  });
  const twoLeads = () => { for (const lead of ['lead-1', 'lead-2']) db.rows.push({ tenant_id: T, call_sid: 'CA1', lead_id: lead, scope: 'contact', granted: true, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: new Date(db.clock += 1000) }); };
  it('two leads on one call: a WITHDRAWAL cannot be attributed to one lead, so it is applied to both and published for both (never lost)', async () => {
    twoLeads();
    await decide('withdrawn', ['contact']);
    expect(await deliverConsentChange(T, 'CA1')).toBe('published');
    expect(published.map((x) => x.payload.leadId).sort()).toEqual(['lead-1', 'lead-2']);
    for (const x of published) expect(x.payload.consent).toMatchObject({ granted: false, scope: ['contact'] });
    // idempotent: a second sweep finds nothing left to spread and derives the same evidence
    published.length = 0;
    expect(await deliverConsentChange(T, 'CA1')).toBe('published');
    expect(published.map((x) => x.payload.consent.scope)).toEqual([['contact'], ['contact']]);
    expect(db.rows.filter((r) => !r.granted)).toHaveLength(2);
  });
  it('two leads on one call: a GRANT cannot be attributed, so it is applied to neither', async () => {
    twoLeads();
    await decide('granted', ['store_medical_information']);
    await deliverConsentChange(T, 'CA1');
    for (const x of published) expect(x.payload.consent.scope).not.toContain('store_medical_information');
    expect(db.rows.filter((r) => r.scope === 'store_medical_information' && r.lead_id !== null)).toHaveLength(0);
  });
  it('a database failure publishes nothing and never throws', async () => {
    linkLead(); db.rows.push({ tenant_id: T, call_sid: 'CA1', lead_id: 'lead-1', scope: 'contact', granted: true, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: new Date(db.clock) });
    db.failReads = true;
    await expect(deliverConsentChange(T, 'CA1')).resolves.toBe('failed');
    expect(published).toHaveLength(0);
  });
  it('no call id: nothing', async () => { expect(await deliverConsentChange(T, undefined)).toBe('no_lead_yet'); expect(published).toHaveLength(0); });
});


describe('durable outbox: no stored decision without a pending notification, no silent loss', () => {
  const linked = () => db.rows.push({ tenant_id: T, call_sid: 'CA1', lead_id: 'lead-1', scope: 'store_personal_data', granted: true, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: new Date(db.clock) });

  it('a decision writes its outbox entry first; flushing delivers it once and marks it delivered', async () => {
    linked();
    expect(await decide('withdrawn', ['contact'])).toMatchObject({ ok: true });
    expect(db.box).toHaveLength(1);
    expect(await flushConsentOutbox(10, { tenantId: T, callSid: 'CA1' })).toEqual({ delivered: 1, pending: 0 });
    expect(published).toHaveLength(1);
    expect(db.box[0]).toMatchObject({ last_outcome: 'published', attempts: 1 });
    expect(await flushConsentOutbox()).toEqual({ delivered: 0, pending: 0 });  // nothing left, nothing re-sent
    expect(published).toHaveLength(1);
  });

  it('if the outbox cannot be written the decision is NOT recorded (fail closed)', async () => {
    db.failOutbox = true;
    expect(await decide('granted', ['contact'])).toMatchObject({ ok: false, reason: 'store_failed' });
    expect(db.rows).toHaveLength(0);
  });

  it('with the event bus down the entry stays pending and is delivered by a later sweep -- the withdrawal is not lost', async () => {
    linked(); bus.up = false;
    await decide('withdrawn', ['contact']);
    expect(await flushConsentOutbox()).toEqual({ delivered: 0, pending: 1 });
    expect(db.box[0]).toMatchObject({ delivered_at: null, last_outcome: 'bus_unavailable', attempts: 1 });
    expect(published).toHaveLength(0);
    bus.up = true;
    expect(await flushConsentOutbox()).toEqual({ delivered: 1, pending: 0 });
    expect(published).toHaveLength(1);
    expect(klarosState(consents())).toEqual(['store_personal_data']);
  });

  it('an entry whose call never gets a lead stays pending, then closes after the TTL (the lead creation event carries the evidence)', async () => {
    await decide('granted', ['contact']);
    expect(await flushConsentOutbox()).toEqual({ delivered: 0, pending: 1 });
    db.box[0].created_at = new Date(Date.now() - CONSENT_OUTBOX_NO_LEAD_TTL_MS - 1000);
    expect(await flushConsentOutbox()).toEqual({ delivered: 1, pending: 0 });
    expect(published).toHaveLength(0);
  });

  it('a flush for one tenant/call never touches another tenant\'s entries', async () => {
    linked();
    await decide('withdrawn', ['contact']);
    db.box.push({ id: 99, tenant_id: OTHER, call_sid: 'CA1', created_at: new Date(), delivered_at: null, attempts: 0, last_outcome: null });
    await flushConsentOutbox(10, { tenantId: T, callSid: 'CA1' });
    expect(db.box.find((b) => b.id === 99)!.delivered_at).toBeNull();
    expect(published.every((p) => p.ctx.tenantId === T)).toBe(true);
  });
});
