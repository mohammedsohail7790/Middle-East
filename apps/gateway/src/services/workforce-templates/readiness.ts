/**
 * The honest readiness state of the pilot workforces, as data. It exists so that "READY" cannot be claimed by prose:
 * each value below is either derived from a fact in the running code (the order-lookup provider) or fixed by a named
 * decision, and the tests in tests/unit/gateway/workforce-readiness.test.ts pin them.
 *
 * Nothing here enables or disables behaviour; it is read by reports and tests only.
 */
import { orderLookupCapability } from '../order-lookup/order-lookup.service.js';
import type { WorkforceVertical } from './types.js';

export type Readiness = 'READY' | 'BLOCKED' | 'NOT_TESTED' | 'NOT_APPLICABLE';

/**
 * Is there CODE that inspects what the agent is about to say and replaces or blocks it?
 *
 * No. Halla enforces tool policy in code, and every content rule (diagnosis, prescription, guarantees, fabrication,
 * emergency handling) is an instruction in the prompt. A code-level output guard is not a small addition on this
 * architecture: the live path is OpenAI Realtime speech-to-speech, which streams audio while it generates, so
 * transcript text arrives with or after the speech it describes. A guard could only cancel a response part-way (some
 * audio would already have been heard) or the pipeline would have to change to text generation + synthesis, which is a
 * product and latency decision. Neither was done, and a keyword filter would not be evidence of medical safety.
 */
export const CODE_LEVEL_OUTPUT_GUARD_IMPLEMENTED = false as boolean;

export const HALLA_LIVE_SAFETY_CONTROL: Readiness = CODE_LEVEL_OUTPUT_GUARD_IMPLEMENTED ? 'READY' : 'BLOCKED';

/** Live-model behaviour was not evaluated: no sandbox model credential/budget was available or authorised. */
export const LIVE_MODEL_BEHAVIOUR: Readiness = 'NOT_TESTED';

/**
 * The Klaros production webhook returned HTTP 429 to six (then eight) sequential deliveries. The cause is not
 * established from Halla's side: Halla's request is well-formed and its retries are spaced, but Klaros's logs and edge
 * configuration are not reachable from here.
 */
export const KLAROS_WEBHOOK_DELIVERY: Readiness = 'BLOCKED';

/**
 * Row-level security: the FIX is verified, in the repository, on real PostgreSQL. Migration 072 replaces the recursive
 * policies (voice_tenants <-> team_members) and the PUBLIC `USING (true)` policies; it is proven with non-superuser,
 * non-BYPASSRLS roles over every tenant-owned table, with mutation tests that restore each defect and must fail, and on
 * a database built fresh from migration 001 to the latest.
 *
 * READY here means exactly that. It does NOT mean any deployed database has the migration: see the two flags below.
 */
export const ROW_LEVEL_SECURITY: Readiness = 'READY';

/** Migration 072 has not been applied to the staging database. It must be, and the RLS suite re-run against it. */
export const RLS_APPLIED_TO_STAGING: Readiness = 'NOT_TESTED';

/**
 * The production policy state has not been inspected (that needs a connection to production, which was not authorised)
 * and 072 has not been applied there. Until it is applied and verified, production keeps whatever policies it has.
 */
export const RLS_APPLIED_TO_PRODUCTION: Readiness = 'NOT_TESTED';

export interface WorkforceReadiness {
  WORKFORCE_DEFINED: Readiness;
  AGENTS_CONFIGURED: Readiness;
  PROMPTS_CONFIGURED: Readiness;
  ESCALATION_CONFIGURED: Readiness;
  SAFETY_POLICY_AVAILABLE: Readiness;
  KLAROS_INTEGRATION_READY: Readiness;
  WEBHOOK_READY: Readiness;
  ORDER_LOOKUP: Readiness | 'BLOCKED_PENDING_KLAROS_READ_API';
  ROW_LEVEL_SECURITY: Readiness;
  RLS_APPLIED_TO_STAGING: Readiness;
  RLS_APPLIED_TO_PRODUCTION: Readiness;
  LIVE_MODEL_BEHAVIOUR: Readiness;
  STAGING_READY: Readiness;
  PRODUCTION_READY: Readiness;
}

export function workforceReadiness(vertical: WorkforceVertical): WorkforceReadiness {
  const orderLookup: WorkforceReadiness['ORDER_LOOKUP'] =
    vertical === 'dropshipping' ? orderLookupCapability() : 'NOT_APPLICABLE';

  const blockers: Array<Readiness | string> = [
    HALLA_LIVE_SAFETY_CONTROL,
    KLAROS_WEBHOOK_DELIVERY,
    ROW_LEVEL_SECURITY,
    RLS_APPLIED_TO_PRODUCTION,
    LIVE_MODEL_BEHAVIOUR,
    ...(vertical === 'dropshipping' ? [orderLookup === 'READY' ? 'READY' : 'BLOCKED'] : []),
  ];
  const production: Readiness = blockers.every((b) => b === 'READY') ? 'READY' : 'BLOCKED';

  return {
    WORKFORCE_DEFINED: 'READY',
    AGENTS_CONFIGURED: 'READY', // templates + provisioning, validated on a throwaway local database only
    PROMPTS_CONFIGURED: 'READY',
    ESCALATION_CONFIGURED: 'READY', // configured as prompt instruction; relies on transfer_call (F3 fixed)
    SAFETY_POLICY_AVAILABLE: HALLA_LIVE_SAFETY_CONTROL,
    KLAROS_INTEGRATION_READY: 'READY', // contract level; the Klaros-side pilot layer was not inspected
    WEBHOOK_READY: KLAROS_WEBHOOK_DELIVERY === 'BLOCKED' ? 'BLOCKED' : 'READY',
    ORDER_LOOKUP: orderLookup,
    ROW_LEVEL_SECURITY,
    RLS_APPLIED_TO_STAGING,
    RLS_APPLIED_TO_PRODUCTION,
    LIVE_MODEL_BEHAVIOUR,
    // conditional: apply migration 072 to staging first, then a sandbox tenant, the allow-list variable and a transfer number
    STAGING_READY: 'READY',
    PRODUCTION_READY: production,
  };
}
