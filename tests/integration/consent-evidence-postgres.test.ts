/**
 * REAL PostgreSQL test of migrations 075/076/077 and the consent-evidence SQL. Skipped unless CONSENT_TEST_DATABASE_URL points at a DISPOSABLE
 * database (it creates and drops stub `voice_tenants` / `leads` tables and the two consent tables). Never point it at a shared database.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const URL_ = process.env.CONSENT_TEST_DATABASE_URL;
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const LEAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const published: Array<{ payload: any; ctx: any }> = [];
let pool: pg.Pool;

vi.mock('../../apps/gateway/src/services/voice/tenant-scope.js', () => ({ get voiceDb() { return pool; } }));
vi.mock('../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../apps/gateway/src/events/platform-event-bus.js', () => ({
  getPlatformEventBus: () => ({ publish: async (_t: string, payload: any, ctx: any) => { published.push({ payload, ctx }); return { eventId: 'e' }; } }),
}));

const run = URL_ ? describe : describe.skip;
run('consent evidence on real PostgreSQL', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL_, max: 4 });
    await pool.query('DROP TABLE IF EXISTS public.lead_consent_outbox, public.lead_consents, public.leads, public.voice_tenants CASCADE');
    await pool.query(`CREATE TABLE public.voice_tenants (id UUID PRIMARY KEY, metadata JSONB)`);
    await pool.query(`CREATE TABLE public.leads (id UUID PRIMARY KEY)`);
    await pool.query(`INSERT INTO public.voice_tenants VALUES ($1, '{"consent_capture":{"wording_version":"MT-CONSENT-v1"}}'), ($2, '{}')`, [T1, T2]);
    await pool.query(`INSERT INTO public.leads VALUES ($1)`, [LEAD]);
    const dir = join(process.cwd(), 'supabase', 'migrations');
    for (const f of ['075_lead_consents.sql', '076_lead_consent_outbox.sql', '077_lead_consents_ordering.sql']) await pool.query(readFileSync(join(dir, f), 'utf8'));
  });
  afterAll(async () => {
    await pool?.query('DROP TABLE IF EXISTS public.lead_consent_outbox, public.lead_consents, public.leads, public.voice_tenants CASCADE');
    await pool?.end();
  });

  it('both migrations are idempotent (re-applying changes nothing) and enable row level security', async () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    for (const f of ['075_lead_consents.sql', '076_lead_consent_outbox.sql', '077_lead_consents_ordering.sql']) await pool.query(readFileSync(join(dir, f), 'utf8'));
    const r = await pool.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('lead_consents','lead_consent_outbox') ORDER BY relname`);
    expect(r.rows).toEqual([{ relname: 'lead_consent_outbox', relrowsecurity: true }, { relname: 'lead_consents', relrowsecurity: true }]);
  });

  it('database constraints refuse an unknown scope, an unknown method, a bad wording label and an unanchored row', async () => {
    const ins = (scope: string, method: string, wording: string, lead: string | null, call: string | null) =>
      pool.query(`INSERT INTO public.lead_consents (tenant_id, lead_id, call_sid, scope, granted, method, wording_version) VALUES ($1,$2,$3,$4,true,$5,$6)`, [T1, lead, call, scope, method, wording]);
    await expect(ins('diagnosis', 'voice_ai_verbal', 'v1', null, 'C')).rejects.toThrow();
    await expect(ins('contact', 'press_1', 'v1', null, 'C')).rejects.toThrow();
    await expect(ins('contact', 'voice_ai_verbal', 'has space', null, 'C')).rejects.toThrow();
    await expect(ins('contact', 'voice_ai_verbal', 'v1', null, null)).rejects.toThrow();
  });

  it('record -> link -> derive -> deliver works end to end in SQL: grant, partial withdrawal, re-grant', async () => {
    const m = await import('../../apps/gateway/src/services/consent/consent-evidence.js');
    expect(await m.getTenantConsentWordingVersion(T1)).toBe('MT-CONSENT-v1');
    expect(await m.getTenantConsentWordingVersion(T2)).toBeUndefined();
    expect(await m.recordConsentDecision(T2, 'CA9', { decision: 'granted', scopes: ['contact'] })).toMatchObject({ ok: false, reason: 'not_enabled' });

    await pool.query(`INSERT INTO public.lead_consents (tenant_id, lead_id, call_sid, scope, granted, method, wording_version) VALUES ($1,$2,'CA1','store_personal_data',true,'voice_ai_verbal','MT-CONSENT-v1')`, [T1, LEAD]);
    const sleep = () => new Promise((r) => setTimeout(r, 25));  // distinct NOW() per statement
    await sleep(); expect(await m.recordConsentDecision(T1, 'CA1', { decision: 'granted', scopes: ['contact'] })).toMatchObject({ ok: true, recorded: 1 });
    expect((await m.flushConsentOutbox(10, { tenantId: T1, callSid: 'CA1' })).delivered).toBe(1);
    await sleep(); await m.recordConsentDecision(T1, 'CA1', { decision: 'withdrawn', scopes: ['contact'] });
    await m.flushConsentOutbox(10, { tenantId: T1, callSid: 'CA1' });
    await sleep(); await m.recordConsentDecision(T1, 'CA1', { decision: 'granted', scopes: ['contact'] });
    await m.flushConsentOutbox(10, { tenantId: T1, callSid: 'CA1' });

    expect(published.map((p) => p.payload.consent.scope)).toEqual([['contact', 'store_personal_data'], ['store_personal_data'], ['contact', 'store_personal_data']]);
    const times = published.map((p) => p.payload.consent.recorded_at);
    expect(times[0] < times[1] && times[1] < times[2]).toBe(true);  // never backwards, including across the partial withdrawal
    expect(published.every((p) => p.ctx.tenantId === T1 && Object.keys(p.payload).sort().join() === 'consent,leadId' && p.payload.leadId === LEAD)).toBe(true);
    const box = await pool.query(`SELECT count(*)::int AS n FROM public.lead_consent_outbox WHERE delivered_at IS NULL`);
    expect(box.rows[0].n).toBe(0);
  });

  it("another tenant's rows with the same call id are never linked or published", async () => {
    const m = await import('../../apps/gateway/src/services/consent/consent-evidence.js');
    published.length = 0;
    await pool.query(`INSERT INTO public.lead_consents (tenant_id, call_sid, scope, granted, method, wording_version) VALUES ($1,'CA1','contact',true,'voice_ai_verbal','x')`, [T2]);
    expect(await m.deliverConsentChange(T2, 'CA1')).toBe('no_lead_yet');
    expect(published).toHaveLength(0);
    const r = await pool.query(`SELECT lead_id FROM public.lead_consents WHERE tenant_id = $1`, [T2]);
    expect(r.rows[0].lead_id).toBeNull();
  });

  it('a decision is atomic: if any part cannot be stored, nothing at all is stored (no orphan outbox entry, no partial scope set)', async () => {
    const m = await import('../../apps/gateway/src/services/consent/consent-evidence.js');
    const ghost = '99999999-9999-4999-8999-999999999999';   // not a tenant: the foreign key rejects the whole statement
    await pool.query(`UPDATE public.voice_tenants SET metadata = '{"consent_capture":{"wording_version":"MT-CONSENT-v1"}}' WHERE id = $1`, [T1]);
    const before = (await pool.query(`SELECT (SELECT count(*) FROM public.lead_consents)::int AS c, (SELECT count(*) FROM public.lead_consent_outbox)::int AS o`)).rows[0];
    expect(await m.recordConsentDecision(ghost, 'CA-ATOM', { decision: 'withdrawn', scopes: ['contact', 'store_personal_data'] })).toMatchObject({ ok: false });
    const after = (await pool.query(`SELECT (SELECT count(*) FROM public.lead_consents)::int AS c, (SELECT count(*) FROM public.lead_consent_outbox)::int AS o`)).rows[0];
    expect(after).toEqual(before);
  });

  it('a multi-scope decision is stored together, with the real clock and a strictly increasing seq', async () => {
    const m = await import('../../apps/gateway/src/services/consent/consent-evidence.js');
    expect(await m.recordConsentDecision(T1, 'CA-MULTI', { decision: 'granted', scopes: ['contact', 'store_personal_data'] })).toMatchObject({ ok: true, recorded: 2 });
    const r = await pool.query(`SELECT scope, seq, recorded_at FROM public.lead_consents WHERE call_sid = 'CA-MULTI' ORDER BY seq`);
    expect(r.rows).toHaveLength(2);
    expect(Number(r.rows[1].seq)).toBeGreaterThan(Number(r.rows[0].seq));
  });

  it('equal timestamps are resolved by storage order, so a same-instant withdrawal after a grant wins deterministically', async () => {
    const m = await import('../../apps/gateway/src/services/consent/consent-evidence.js');
    const L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await pool.query(`INSERT INTO public.leads VALUES ($1)`, [L2]);
    const at = '2026-10-09T10:00:00.000Z';
    for (const g of [true, false]) {
      await pool.query(`INSERT INTO public.lead_consents (tenant_id, lead_id, scope, granted, method, wording_version, recorded_at) VALUES ($1,$2,'contact',$3,'voice_ai_verbal','MT-CONSENT-v1',$4)`, [T1, L2, g, at]);
    }
    expect(await m.getConsentEvidenceForLead(T1, L2)).toMatchObject({ granted: false, scope: ['contact'] });
  });

  it('two leads on one call: a withdrawal reaches both leads, a grant reaches neither', async () => {
    const m = await import('../../apps/gateway/src/services/consent/consent-evidence.js');
    const [A, B] = ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
    for (const id of [A, B]) {
      await pool.query(`INSERT INTO public.leads VALUES ($1)`, [id]);
      await pool.query(`INSERT INTO public.lead_consents (tenant_id, lead_id, call_sid, scope, granted, method, wording_version) VALUES ($1,$2,'CA-TWO','contact',true,'voice_ai_verbal','MT-CONSENT-v1')`, [T1, id]);
    }
    published.length = 0;
    await m.recordConsentDecision(T1, 'CA-TWO', { decision: 'withdrawn', scopes: ['contact'] });
    await m.recordConsentDecision(T1, 'CA-TWO', { decision: 'granted', scopes: ['store_medical_information'] });
    expect(await m.deliverConsentChange(T1, 'CA-TWO')).toBe('published');
    expect(published.map((p) => p.payload.leadId).sort()).toEqual([A, B]);
    for (const p of published) expect(p.payload.consent).toMatchObject({ granted: false, scope: ['contact'] });
    const med = await pool.query(`SELECT count(*)::int AS n FROM public.lead_consents WHERE tenant_id=$1 AND scope='store_medical_information' AND lead_id IS NOT NULL`, [T1]);
    expect(med.rows[0].n).toBe(0);
  });
});
