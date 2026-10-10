/**
 * Server-side consent ENFORCEMENT for tenants that opted in to consent capture (voice_tenants.metadata.consent_capture has a wording
 * version). Recording a decision (consent-evidence.ts) proves what a caller said; this module makes the gateway act on it:
 *
 *   - create_lead / post-call lead storage need a granted `store_personal_data` decision for THIS call;
 *   - the call transcript is persisted only with a granted `store_medical_information` decision (the AI never asks for it today,
 *     so a Medical Tourism transcript is, by default, not kept);
 *   - an outbound call to a lead needs a currently granted `contact` decision on that lead.
 *
 * Tenants WITHOUT the opt-in are completely unchanged (`enforced: false`, everything allowed). For an opted-in tenant every failure
 * (database error, no decision, withdrawn, ambiguous lead) DENIES. Nothing here infers consent from a call, a keypress or a transcript.
 */
import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';
import { deriveConsentEvidence, parseConsentCaptureConfig, readConsentEvidenceForLead, type ConsentRow, type ConsentScope } from './consent-evidence.js';

export interface ConsentGate {
  /** false => the tenant has not opted in and nothing is restricted */
  enforced: boolean;
  /** why a decision could not be made (set only when enforced and unavailable) */
  unavailable?: boolean;
  allows(scope: ConsentScope): boolean;
}

const OPEN_GATE: ConsentGate = { enforced: false, allows: () => true };
const closedGate = (unavailable: boolean): ConsentGate => ({ enforced: true, unavailable, allows: () => false });

/** Reads the tenant's consent configuration. THROWS on a database error (the caller decides how to fail). */
async function readConsentEnforced(tenantId: string): Promise<boolean> {
  const r = await voiceDb.query(
    `SELECT metadata->'consent_capture' AS consent_capture FROM public.voice_tenants WHERE id = $1 LIMIT 1`,
    [tenantId]
  );
  return parseConsentCaptureConfig(r.rows[0]?.consent_capture) !== undefined;
}

/** Pure: which scopes are currently granted according to the stored decisions of one call (conservative: see deriveConsentEvidence). */
export function grantedScopesFromRows(rows: ConsentRow[]): ConsentScope[] {
  const ev = deriveConsentEvidence(rows);
  return ev && ev.granted ? ev.scope : [];
}

/** The gate for one call. Fails CLOSED for an opted-in tenant; an unreadable configuration is treated as opted-in. */
export async function getCallConsentGate(tenantId: string, callSid: string | undefined): Promise<ConsentGate> {
  let enforced: boolean;
  try {
    enforced = await readConsentEnforced(tenantId);
  } catch (err) {
    logger.error('CONSENT_GATE_CONFIG_UNAVAILABLE', { tenantId, error: err instanceof Error ? err.name : 'error' });
    return closedGate(true);
  }
  if (!enforced) return OPEN_GATE;
  if (!callSid) return closedGate(false);
  try {
    const r = await voiceDb.query(
      `SELECT scope, granted, method, wording_version, recorded_at
         FROM public.lead_consents WHERE tenant_id = $1 AND call_sid = $2 ORDER BY recorded_at, seq`,
      [tenantId, callSid]
    );
    const granted = new Set(grantedScopesFromRows(r.rows as ConsentRow[]));
    return { enforced: true, allows: (scope) => granted.has(scope) };
  } catch (err) {
    logger.error('CONSENT_GATE_READ_FAILED', { tenantId, error: err instanceof Error ? err.name : 'error' });
    return closedGate(true);
  }
}

export type OutboundConsentCode = 'no_lead' | 'ambiguous_lead' | 'no_contact_consent' | 'consent_state_unavailable';

export class ConsentRequiredError extends Error {
  readonly code: OutboundConsentCode;
  constructor(code: OutboundConsentCode) {
    super(`Outbound contact refused: ${code}`);
    this.name = 'ConsentRequiredError';
    this.code = code;
  }
}

const digits = (p: string) => p.replace(/[^\d+]/g, '');

/**
 * Throws ConsentRequiredError unless the lead with this phone number currently has a granted `contact` decision. A tenant that has not
 * opted in is never restricted. The lead is matched by tenant + phone; no match, several matches, a withdrawn or missing decision,
 * or any database error all refuse.
 */
export async function assertOutboundContactConsent(tenantId: string, toNumber: string): Promise<void> {
  let enforced: boolean;
  try {
    enforced = await readConsentEnforced(tenantId);
  } catch {
    throw new ConsentRequiredError('consent_state_unavailable');
  }
  if (!enforced) return;
  try {
    const leads = await voiceDb.query(
      `SELECT id FROM public.leads WHERE tenant_id = $1 AND regexp_replace(phone, '[^0-9+]', '', 'g') = $2 LIMIT 2`,
      [tenantId, digits(toNumber)]
    );
    if (leads.rows.length === 0) throw new ConsentRequiredError('no_lead');
    if (leads.rows.length > 1) throw new ConsentRequiredError('ambiguous_lead');
    const evidence = await readConsentEvidenceForLead(tenantId, String(leads.rows[0].id));
    if (!evidence || !evidence.granted || !evidence.scope.includes('contact')) throw new ConsentRequiredError('no_contact_consent');
  } catch (err) {
    if (err instanceof ConsentRequiredError) throw err;
    logger.error('CONSENT_GATE_OUTBOUND_READ_FAILED', { tenantId, error: err instanceof Error ? err.name : 'error' });
    throw new ConsentRequiredError('consent_state_unavailable');
  }
}
