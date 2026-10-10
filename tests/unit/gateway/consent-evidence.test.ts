/**
 * Medical Tourism consent evidence (apps/gateway/src/services/consent/consent-evidence.ts), the record_consent tool, and the
 * rule that nothing else can create consent. The database is a faked `voiceDb`; this proves the logic and the guarantees at the
 * code level, not the SQL against a real database and not that any wording is legally sufficient.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

type Row = { tenant_id: string; call_sid: string | null; lead_id: string | null; scope: string; granted: boolean; method: string; wording_version: string; recorded_at: Date };

const db: { rows: Row[]; wording: unknown; fail: boolean; clock: number } = { rows: [], wording: 'MT-CONSENT-v1', fail: false, clock: Date.parse('2026-10-09T10:00:00.000Z') };
const inserts: unknown[][] = [];

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: vi.fn(async (sql: string, params: any[]) => {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (db.fail) throw new Error('relation "public.lead_consents" does not exist');
      if (text.startsWith("SELECT metadata->'consent_capture'")) {
        return { rows: db.wording === undefined ? [] : [{ consent_capture: db.wording === null ? null : { wording_version: db.wording } }] };
      }
      if (text.startsWith('INSERT INTO public.lead_consent_outbox')) return { rows: [] };
      if (text.startsWith('INSERT INTO public.lead_consents')) {
        inserts.push(params);
        const [tenant_id, call_sid, scope, granted, method, wording_version] = params;
        db.rows.push({ tenant_id, call_sid, lead_id: null, scope, granted, method, wording_version, recorded_at: new Date((db.clock += 1000)) });
        return { rows: [] };
      }
      if (text.startsWith('UPDATE public.lead_consents SET lead_id')) {
        const [tenant, call, lead] = params;
        for (const r of db.rows) if (r.tenant_id === tenant && r.call_sid === call && r.lead_id === null) r.lead_id = lead;
        return { rows: [] };
      }
      if (text.startsWith('SELECT scope, granted, method, wording_version, recorded_at FROM public.lead_consents')) {
        const [tenant, lead] = params;
        return { rows: db.rows.filter((r) => r.tenant_id === tenant && r.lead_id === lead) };
      }
      throw new Error(`unexpected query in test fake: ${text}`);
    }),
  },
}));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

import {
  deriveConsentEvidence, sanitizeConsentEvidence, recordConsentDecision, resolveConsentForLeadEvent, getConsentEvidenceForLead,
  parseConsentCaptureConfig, isValidWordingVersion, type ConsentRow,
} from '../../../apps/gateway/src/services/consent/consent-evidence.js';
import { buildToolsList } from '../../../apps/gateway/src/services/realtime/realtime-tool-schemas.js';
import { RealtimeToolsManager } from '../../../apps/gateway/src/services/realtime/realtime.tools.js';
import { resolveToolPolicy } from '../../../apps/gateway/src/services/ai-governance/tool-policy-engine.js';

const T = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const LEAD = '33333333-3333-4333-8333-333333333333';
const session = (tenantId = T, callSid: string | undefined = 'CA100') => ({ id: 's1', tenantId, callSid }) as never;
const row = (o: Partial<ConsentRow> = {}): ConsentRow => ({ scope: 'contact', granted: true, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: '2026-10-09T10:00:00.000Z', ...o });

beforeEach(() => { db.rows = []; db.wording = 'MT-CONSENT-v1'; db.fail = false; db.clock = Date.parse('2026-10-09T10:00:00.000Z'); inserts.length = 0; });

describe('explicit consent produces the correct evidence', () => {
  it('a granted decision becomes exactly the five contract fields', () => {
    expect(deriveConsentEvidence([row()])).toEqual({ granted: true, scope: ['contact'], method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: '2026-10-09T10:00:00.000Z' });
  });

  it('records through the tool: wording version from tenant config, time from the server, scope exactly as answered', async () => {
    const r = await new RealtimeToolsManager().executeToolDirect(session(), 'record_consent', { decision: 'granted', scopes: ['contact', 'store_personal_data'] });
    expect(r.success).toBe(true);
    expect(inserts).toHaveLength(2);
    const ev = await resolveConsentForLeadEvent(T, LEAD, 'CA100');
    expect(ev).toEqual({ granted: true, scope: ['contact', 'store_personal_data'], method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: expect.stringMatching(/^2026-10-09T10:00:0\d\.000Z$/) });
  });

  it('the model cannot supply the wording version, method or timestamp: extra arguments are ignored', async () => {
    await new RealtimeToolsManager().executeToolDirect(session(), 'record_consent', {
      decision: 'granted', scopes: ['contact'], wording_version: 'MODEL-INVENTED', method: 'dtmf', recorded_at: '1999-01-01T00:00:00Z', granted: false,
    });
    expect(inserts[0]).toEqual([T, 'CA100', 'contact', true, 'voice_ai_verbal', 'MT-CONSENT-v1']);
    expect(JSON.stringify(inserts)).not.toMatch(/MODEL-INVENTED|dtmf|1999/);
  });
});

describe('no consent, declined, withdrawn or ambiguous consent never produces a granted record', () => {
  it('no rows at all => no evidence', async () => {
    expect(deriveConsentEvidence([])).toBeUndefined();
    expect(await resolveConsentForLeadEvent(T, LEAD, 'CA100')).toBeUndefined();
  });

  it('declined is a record of refusal, never of a grant', async () => {
    await new RealtimeToolsManager().executeToolDirect(session(), 'record_consent', { decision: 'declined', scopes: ['store_personal_data'] });
    const ev = await resolveConsentForLeadEvent(T, LEAD, 'CA100');
    expect(ev).toMatchObject({ granted: false, scope: ['store_personal_data'] });
  });

  it('withdrawal after a grant removes that scope, and only that scope', () => {
    const rows = [
      row({ scope: 'contact', recorded_at: '2026-10-09T10:00:00.000Z' }),
      row({ scope: 'store_personal_data', recorded_at: '2026-10-09T10:00:01.000Z' }),
      row({ scope: 'contact', granted: false, recorded_at: '2026-10-09T10:00:05.000Z' }),
    ];
    expect(deriveConsentEvidence(rows)).toMatchObject({ granted: true, scope: ['store_personal_data'] });
  });

  it('withdrawing the only grant leaves granted:false, not the old grant', () => {
    const rows = [row({ recorded_at: '2026-10-09T10:00:00.000Z' }), row({ granted: false, recorded_at: '2026-10-09T10:00:09.000Z' })];
    expect(deriveConsentEvidence(rows)).toMatchObject({ granted: false, scope: ['contact'] });
  });

  it.each([['ambiguous'], ['maybe'], ['yes'], [''], [undefined], [null], [true], [1]])('an unrecognised decision (%s) stores nothing', async (decision) => {
    const r = await new RealtimeToolsManager().executeToolDirect(session(), 'record_consent', { decision, scopes: ['contact'] });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/Nothing was recorded/);
    expect(inserts).toHaveLength(0);
  });

  it.each([[undefined], [[]], ['contact'], [['all']], [['contact', 'medical']], [[{ scope: 'contact' }]]])('missing or unknown scopes (%j) store nothing', async (scopes) => {
    const r = await new RealtimeToolsManager().executeToolDirect(session(), 'record_consent', { decision: 'granted', scopes });
    expect(r.success).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});

describe('pressing 1 to speak to the AI does not create storage consent', () => {
  it('a call, with the Compliance Center consent gate answered, but no record_consent call, yields no evidence', async () => {
    // Nothing a caller presses writes consent: the only writer is recordConsentDecision (asserted below). With no recorded decision:
    expect(await resolveConsentForLeadEvent(T, LEAD, 'CA100')).toBeUndefined();
  });

  it('the voice controller (consent-response / the 1-to-continue gate) cannot write consent: it does not reference the consent module or table', () => {
    const src = readFileSync(join(process.cwd(), 'apps/gateway/src/services/voice/voice.controller.ts'), 'utf8');
    expect(src).not.toMatch(/consent-evidence|lead_consents|recordConsentDecision|record_consent/);
  });

  it('recordConsentDecision is called from exactly one production place: the record_consent tool', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== 'dist') walk(p); continue; }
        if (!/\.ts$/.test(name) || p.includes('consent-evidence.ts')) continue;
        if (/recordConsentDecision|INSERT INTO public\.lead_consents/.test(readFileSync(p, 'utf8'))) hits.push(p.replace(/\\/g, '/').split('apps/gateway/src/')[1]);
      }
    };
    walk(join(process.cwd(), 'apps/gateway/src'));
    expect(hits).toEqual(['services/realtime/realtime.tools.ts']);
  });

  it('the consent-required setting and a transcript are not inputs: deriveConsentEvidence only reads stored decision rows', () => {
    expect(deriveConsentEvidence([{ consentRequired: true, transcript: 'yes you may store my details' } as never])).toBeUndefined();
  });
});

describe('contact consent does not imply medical-information (or personal-data) consent', () => {
  it('a contact grant alone never emits a broader scope', () => {
    const ev = deriveConsentEvidence([row({ scope: 'contact' })])!;
    expect(ev.scope).toEqual(['contact']);
    expect(ev.scope).not.toContain('store_personal_data');
    expect(ev.scope).not.toContain('store_medical_information');
  });

  it('a medical-information decline next to a contact grant: the grant is reported without the medical scope', () => {
    const rows = [row({ scope: 'contact' }), row({ scope: 'store_medical_information', granted: false, recorded_at: '2026-10-09T10:00:03.000Z' })];
    expect(deriveConsentEvidence(rows)).toMatchObject({ granted: true, scope: ['contact'] });
  });

  it('scopes decided under a different wording version are left out, never merged into a wider claim', () => {
    const rows = [
      row({ scope: 'contact', wording_version: 'MT-CONSENT-v1', recorded_at: '2026-10-09T10:00:00.000Z' }),
      row({ scope: 'store_personal_data', wording_version: 'MT-CONSENT-v2', recorded_at: '2026-10-09T10:00:07.000Z' }),
    ];
    const ev = deriveConsentEvidence(rows)!;
    expect(ev).toMatchObject({ granted: true, scope: ['store_personal_data'], wording_version: 'MT-CONSENT-v2' });
  });
});

describe('missing or invalid evidence is omitted, never repaired or invented', () => {
  it.each([
    ['unknown scope', row({ scope: 'everything' })],
    ['non-boolean granted', row({ granted: 'true' })],
    ['unknown method', row({ method: 'dtmf' })],
    ['no wording version', row({ wording_version: '' })],
    ['null wording version', row({ wording_version: null })],
    ['wording text instead of a version label', row({ wording_version: 'I agree that you may keep my details and call me' })],
    ['no timestamp', row({ recorded_at: null })],
    ['unparseable timestamp', row({ recorded_at: 'yesterday' })],
    ['future timestamp', row({ recorded_at: new Date(Date.now() + 3_600_000).toISOString() })],
  ])('%s => no evidence', (_n, r) => {
    expect(deriveConsentEvidence([r])).toBeUndefined();
  });

  it('an invalid row does not hide a valid one, and does not widen it', () => {
    expect(deriveConsentEvidence([row({ scope: 'everything' }), row()])).toMatchObject({ granted: true, scope: ['contact'] });
  });

  it('a tenant with no configured wording version stores nothing and tells the agent', async () => {
    for (const w of [undefined, null, '', 'not a version!', 42]) {
      db.wording = w;
      const r = await new RealtimeToolsManager().executeToolDirect(session(), 'record_consent', { decision: 'granted', scopes: ['contact'] });
      expect(r.success).toBe(false);
    }
    expect(inserts).toHaveLength(0);
  });

  it('a call-less session cannot record', async () => {
    expect((await recordConsentDecision(T, undefined, { decision: 'granted', scopes: ['contact'] })).ok).toBe(false);
  });

  it('a database failure (including the table not existing yet) yields no evidence and no throw', async () => {
    db.fail = true;
    expect(await getConsentEvidenceForLead(T, LEAD)).toBeUndefined();
    expect(await resolveConsentForLeadEvent(T, LEAD, 'CA100')).toBeUndefined();
    const r = await new RealtimeToolsManager().executeToolDirect(session(), 'record_consent', { decision: 'granted', scopes: ['contact'] });
    expect(r.success).toBe(false);
  });

  it('evidence is tenant-isolated: another tenant cannot read, or be linked to, this tenant\'s decisions', async () => {
    await new RealtimeToolsManager().executeToolDirect(session(), 'record_consent', { decision: 'granted', scopes: ['contact'] });
    expect(await resolveConsentForLeadEvent(OTHER, LEAD, 'CA100')).toBeUndefined();
    expect(db.rows[0].lead_id).toBeNull();
    expect(await resolveConsentForLeadEvent(T, LEAD, 'CA100')).toMatchObject({ granted: true });
  });

  it('decisions only attach to the lead of the call they were made on', async () => {
    await new RealtimeToolsManager().executeToolDirect(session(T, 'CA100'), 'record_consent', { decision: 'granted', scopes: ['contact'] });
    expect(await resolveConsentForLeadEvent(T, LEAD, 'CA-OTHER-CALL')).toBeUndefined();
    expect(await resolveConsentForLeadEvent(T, LEAD)).toBeUndefined();
  });
});

describe('sanitizeConsentEvidence: the outbound boundary', () => {
  const good = { granted: true, scope: ['contact'], method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: '2026-10-09T10:00:00.000Z' };

  it('rebuilds a valid object field by field and drops everything else (wording text, transcript, medical content, PII)', () => {
    const out = sanitizeConsentEvidence({ ...good, wording_text: 'I agree...', transcript: 'my diagnosis is', medical: 'x', phone: '+971500000000' });
    expect(out).toEqual(good);
    expect(Object.keys(out!).sort()).toEqual(['granted', 'method', 'recorded_at', 'scope', 'wording_version']);
  });

  it.each([
    [null], [undefined], ['granted'], [[]], [{}],
    [{ ...good, granted: 'yes' }], [{ ...good, granted: undefined }],
    [{ ...good, scope: [] }], [{ ...good, scope: 'contact' }], [{ ...good, scope: ['contact', 'anything'] }], [{ ...good, scope: ['contact', 'store_personal_data', 'store_medical_information', 'contact'] }],
    [{ ...good, method: 'phone_press_1' }], [{ ...good, wording_version: '' }], [{ ...good, wording_version: 'x'.repeat(65) }],
    [{ ...good, recorded_at: 'not a date' }], [{ ...good, recorded_at: undefined }],
  ])('rejects a malformed object (%j)', (v) => {
    expect(sanitizeConsentEvidence(v)).toBeUndefined();
  });

  it('de-duplicates and orders the scope list', () => {
    expect(sanitizeConsentEvidence({ ...good, scope: ['store_personal_data', 'contact', 'contact'] })!.scope).toEqual(['contact', 'store_personal_data']);
  });
});

describe('tool exposure and governance', () => {
  const base = { capabilities: {}, transferPhoneNumber: '+10000000000' };

  it('is not offered to a tenant without a configured wording version (existing tenants unchanged)', () => {
    expect(buildToolsList(base as never, 'professional').map((t) => t.name)).not.toContain('record_consent');
    expect(buildToolsList({ ...base, consentCapture: undefined } as never, 'professional').map((t) => t.name)).not.toContain('record_consent');
  });

  it('is offered, with closed enumerations and no wording/timestamp parameter, to an opted-in tenant', () => {
    const tool = buildToolsList({ ...base, consentCapture: { wordingVersion: 'MT-CONSENT-v1' } } as never, 'professional').find((t) => t.name === 'record_consent');
    expect(tool).toBeTruthy();
    expect(tool.parameters.required).toEqual(['decision', 'scopes']);
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['decision', 'scopes']);
    expect(tool.parameters.properties.decision.enum).toEqual(['granted', 'declined', 'withdrawn']);
    expect(tool.parameters.properties.scopes.items.enum).toEqual(['contact', 'store_personal_data', 'store_medical_information']);
  });

  it('is registered with the governance policy (an unregistered tool is default-denied) and may repeat within a call', () => {
    const p = resolveToolPolicy(T, 'record_consent');
    expect(p.enabled).toBe(true);
    expect(p.constraints?.preventDuplicateExecution).toBe(false);
    expect(resolveToolPolicy(T, 'record_consent', { disabledTools: ['record_consent'] }).enabled).toBe(false);
  });

  it('parseConsentCaptureConfig / isValidWordingVersion accept only a short label, never prose', () => {
    expect(parseConsentCaptureConfig({ wording_version: 'MT-CONSENT-v1' })).toEqual({ wordingVersion: 'MT-CONSENT-v1' });
    for (const bad of [undefined, null, {}, { wording_version: '' }, { wording_version: 'I consent to everything' }, { wording_version: 5 }]) {
      expect(parseConsentCaptureConfig(bad)).toBeUndefined();
    }
    expect(isValidWordingVersion('v2026-10')).toBe(true);
    expect(isValidWordingVersion('has space')).toBe(false);
  });
});

describe('a caller may change their mind within one call', () => {
  it('grant, withdraw and re-grant the same scope back to back: every decision is stored (none is skipped as an idempotent repeat) and the last one wins', async () => {
    const tools = new RealtimeToolsManager();
    const s = session(T, 'CA-CHANGE');
    for (const decision of ['granted', 'withdrawn', 'granted']) {
      expect((await tools.executeToolDirect(s, 'record_consent', { decision, scopes: ['contact'] })).success).toBe(true);
    }
    expect(inserts).toHaveLength(3);
    expect(await resolveConsentForLeadEvent(T, LEAD, 'CA-CHANGE')).toMatchObject({ granted: true, scope: ['contact'] });
  });
});
