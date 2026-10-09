/**
 * Consent evidence for the Halla -> Klaros `lead.created` / `lead.updated` events.
 *
 * What this is: a record that a caller gave (or refused, or withdrew) an explicit, spoken decision about a NAMED scope, at the
 * moment they gave it, under a wording version the business configured. What it is not: legal compliance, consent inferred from a
 * call / a keypress / a transcript / a "consent required" setting, or the consent wording itself (the wording text never leaves).
 *
 * Rules enforced here (and by tests):
 *  - Pressing 1 to speak to the AI (the Compliance Center gate) never produces a record. Only the `record_consent` tool does.
 *  - Scopes are independent. `contact` does not imply `store_personal_data`, and neither implies `store_medical_information`.
 *  - A decision other than granted / declined / withdrawn (ambiguous, silence, unknown) is not recorded at all.
 *  - `wording_version` is never invented: it is the tenant's own configured label. With none configured nothing is recorded.
 *  - `recorded_at` is the server time at recording; the model cannot supply it.
 *  - Everything fails closed: any error means "no evidence", never a fabricated or broadened grant.
 */
import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';

export const CONSENT_SCOPES = ['contact', 'store_personal_data', 'store_medical_information'] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const CONSENT_METHODS = ['voice_ai_verbal'] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const CONSENT_DECISIONS = ['granted', 'declined', 'withdrawn'] as const;
export type ConsentDecision = (typeof CONSENT_DECISIONS)[number];

/** The ONLY consent shape that leaves Halla. No wording text, no transcript, no medical content, no personal data. */
export interface ConsentEvidence {
  granted: boolean;
  /** The scopes this decision covers, sorted. For `granted: true` exactly the scopes agreed to, never more. */
  scope: ConsentScope[];
  method: ConsentMethod;
  wording_version: string;
  /** ISO-8601, server time at the moment the decision was recorded. */
  recorded_at: string;
}

/** One stored decision for one scope. */
export interface ConsentRow {
  scope: unknown;
  granted: unknown;
  method: unknown;
  wording_version: unknown;
  recorded_at: unknown;
}

const WORDING_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const isScope = (v: unknown): v is ConsentScope => typeof v === 'string' && (CONSENT_SCOPES as readonly string[]).includes(v);
const isMethod = (v: unknown): v is ConsentMethod => typeof v === 'string' && (CONSENT_METHODS as readonly string[]).includes(v);
export const isValidWordingVersion = (v: unknown): v is string => typeof v === 'string' && WORDING_VERSION_RE.test(v);

/** A real, parseable timestamp; returned as ISO. Rejects absent, unparseable and (beyond a small skew) future values. */
function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : typeof v === 'string' ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  if (d.getTime() > Date.now() + 5 * 60_000) return null;
  return d.toISOString();
}

interface ValidRow { scope: ConsentScope; granted: boolean; method: ConsentMethod; wording: string; at: string; idx: number }

function validRows(rows: ConsentRow[]): ValidRow[] {
  const out: ValidRow[] = [];
  rows.forEach((r, idx) => {
    if (!r || !isScope(r.scope) || typeof r.granted !== 'boolean' || !isMethod(r.method) || !isValidWordingVersion(r.wording_version)) return;
    const at = toIso(r.recorded_at);
    if (!at) return;
    out.push({ scope: r.scope, granted: r.granted, method: r.method, wording: r.wording_version, at, idx });
  });
  return out;
}

const later = (a: ValidRow, b: ValidRow) => (a.at !== b.at ? (a.at > b.at ? a : b) : a.idx > b.idx ? a : b);

/**
 * Collapses stored decisions into the single evidence object an event may carry, or `undefined`.
 *
 *  - Per scope, only the LATEST decision counts (a withdrawal removes an earlier grant).
 *  - If any scope is currently granted: `{ granted: true, scope: [exactly the granted scopes] }`.
 *  - Otherwise, if a scope is currently declined/withdrawn: `{ granted: false, scope: [those scopes] }`.
 *  - Otherwise `undefined`. Invalid rows are ignored, never repaired.
 *  - Scopes decided under a different wording version or method than the most recent one are left out (narrower, never broader).
 */
export function deriveConsentEvidence(rows: ConsentRow[]): ConsentEvidence | undefined {
  const latest = new Map<ConsentScope, ValidRow>();
  for (const r of validRows(rows)) {
    const prev = latest.get(r.scope);
    latest.set(r.scope, prev ? later(prev, r) : r);
  }
  const all = [...latest.values()];
  const pick = (granted: boolean): ConsentEvidence | undefined => {
    const group = all.filter((r) => r.granted === granted);
    if (!group.length) return undefined;
    const ref = group.reduce(later);
    const same = group.filter((r) => r.wording === ref.wording && r.method === ref.method);
    return {
      granted,
      scope: same.map((r) => r.scope).sort((a, b) => CONSENT_SCOPES.indexOf(a) - CONSENT_SCOPES.indexOf(b)),
      method: ref.method,
      wording_version: ref.wording,
      recorded_at: same.map((r) => r.at).reduce((a, b) => (a > b ? a : b)),
    };
  };
  return pick(true) ?? pick(false);
}

/**
 * Strict whitelist applied at the outbound boundary. Whatever a producer put on the platform event, only a well-formed
 * evidence object survives, rebuilt field by field; anything else (extra keys, wrong types, empty scope, bad timestamp) is dropped.
 */
export function sanitizeConsentEvidence(value: unknown): ConsentEvidence | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.granted !== 'boolean' || !isMethod(v.method) || !isValidWordingVersion(v.wording_version)) return undefined;
  if (!Array.isArray(v.scope) || v.scope.length === 0 || v.scope.length > CONSENT_SCOPES.length || !v.scope.every(isScope)) return undefined;
  const scope = [...new Set(v.scope as ConsentScope[])].sort((a, b) => CONSENT_SCOPES.indexOf(a) - CONSENT_SCOPES.indexOf(b));
  const recorded = toIso(v.recorded_at);
  if (!recorded) return undefined;
  return { granted: v.granted, scope, method: v.method, wording_version: v.wording_version, recorded_at: recorded };
}

/** The tenant's configured wording label: `voice_tenants.metadata.consent_capture.wording_version`. Absent/invalid => undefined. */
export function parseConsentCaptureConfig(raw: unknown): { wordingVersion: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = (raw as Record<string, unknown>).wording_version;
  return isValidWordingVersion(v) ? { wordingVersion: v } : undefined;
}

export async function getTenantConsentWordingVersion(tenantId: string): Promise<string | undefined> {
  try {
    const r = await voiceDb.query(
      `SELECT metadata->'consent_capture' AS consent_capture FROM public.voice_tenants WHERE id = $1 LIMIT 1`,
      [tenantId]
    );
    return parseConsentCaptureConfig(r.rows[0]?.consent_capture)?.wordingVersion;
  } catch (err) {
    logger.warn('CONSENT_CONFIG_LOOKUP_FAILED', { tenantId, error: err instanceof Error ? err.name : 'error' });
    return undefined;
  }
}

export type RecordConsentFailure = 'not_enabled' | 'invalid_decision' | 'invalid_scope' | 'no_call' | 'store_failed';
/** Not a discriminated union on purpose: the gateway tsconfig is not strict, so `ok` would not narrow. `reason` is set iff `ok` is false. */
export interface RecordConsentResult { ok: boolean; recorded?: number; reason?: RecordConsentFailure }

/**
 * Stores ONE explicit decision, one row per scope, keyed to the call (the lead usually does not exist yet when consent is asked).
 * Only the three enumerated decisions and the three enumerated scopes are accepted; the wording version comes from tenant
 * configuration and the timestamp from the database clock. Nothing the model says can set either.
 */
export async function recordConsentDecision(
  tenantId: string,
  callSid: string | undefined,
  input: { decision: unknown; scopes: unknown }
): Promise<RecordConsentResult> {
  if (!callSid) return { ok: false, reason: 'no_call' };
  if (typeof input.decision !== 'string' || !(CONSENT_DECISIONS as readonly string[]).includes(input.decision)) {
    return { ok: false, reason: 'invalid_decision' };
  }
  if (!Array.isArray(input.scopes) || input.scopes.length === 0 || !input.scopes.every(isScope)) return { ok: false, reason: 'invalid_scope' };
  const scopes = [...new Set(input.scopes as ConsentScope[])];
  const wording = await getTenantConsentWordingVersion(tenantId);
  if (!wording) return { ok: false, reason: 'not_enabled' };
  const granted = input.decision === 'granted';
  try {
    for (const scope of scopes) {
      await voiceDb.query(
        `INSERT INTO public.lead_consents (tenant_id, call_sid, scope, granted, method, wording_version)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, callSid, scope, granted, 'voice_ai_verbal', wording]
      );
    }
    return { ok: true, recorded: scopes.length };
  } catch (err) {
    logger.warn('CONSENT_RECORD_FAILED', { tenantId, error: err instanceof Error ? err.name : 'error' });
    return { ok: false, reason: 'store_failed' };
  }
}

/**
 * Attaches the decisions recorded during a call to the lead created or matched on that call. Only rows with no lead yet are
 * touched, only within the same tenant and call. Best effort: failure leaves them unlinked and so produces no evidence.
 */
export async function linkCallConsentToLead(tenantId: string, callSid: string | undefined, leadId: string): Promise<void> {
  if (!callSid) return;
  try {
    await voiceDb.query(
      `UPDATE public.lead_consents SET lead_id = $3 WHERE tenant_id = $1 AND call_sid = $2 AND lead_id IS NULL`,
      [tenantId, callSid, leadId]
    );
  } catch (err) {
    logger.warn('CONSENT_LINK_FAILED', { tenantId, error: err instanceof Error ? err.name : 'error' });
  }
}

/** Evidence for a lead event, from rows linked to that lead in that tenant. Any error (including a missing table) => undefined. */
export async function getConsentEvidenceForLead(tenantId: string, leadId: string): Promise<ConsentEvidence | undefined> {
  try {
    const r = await voiceDb.query(
      `SELECT scope, granted, method, wording_version, recorded_at
         FROM public.lead_consents WHERE tenant_id = $1 AND lead_id = $2`,
      [tenantId, leadId]
    );
    return deriveConsentEvidence(r.rows as ConsentRow[]);
  } catch {
    return undefined;
  }
}

/** Link the call's decisions to the lead, then read the lead's evidence. For the lead.created / lead.updated publishers. */
export async function resolveConsentForLeadEvent(tenantId: string, leadId: string, callSid?: string): Promise<ConsentEvidence | undefined> {
  await linkCallConsentToLead(tenantId, callSid, leadId);
  return getConsentEvidenceForLead(tenantId, leadId);
}
