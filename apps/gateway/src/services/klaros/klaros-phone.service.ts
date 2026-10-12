import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import { PhoneProvisioningService, isGatewayReadyForTwilio, isTwilioConfigured } from '../phone-provisioning/phoneProvisioning.service.js';
import { ensureTrialSubscription, findKlarosTenant, KlarosProvisioningError, templateStatus } from './klaros-provisioning.service.js';

/**
 * Klaros-driven phone numbers. A business Klaros created has no usable Halla login, so the owner cannot use Halla's own number screens; Klaros asks
 * here instead, with the same platform secret as provisioning. Two ways in, and they can be combined:
 *   - GET A NEW NUMBER: search Twilio numbers by area code, then buy one. This spends money, so it needs the quoted monthly cost to be accepted
 *     explicitly, allows one active number per business, and stops at a monthly cap across all Klaros businesses (fails closed).
 *   - USE MY EXISTING NUMBER: the business keeps its line. It is stored as the human hand-off number (escalations ring it) and the owner forwards
 *     that line to the Halla number. Nothing is bought or ported.
 * The Receptionist agent is pinned to every number, so the intake and consent flow always answers.
 */
export class KlarosPhoneError extends KlarosProvisioningError {}

/** What the existing number-purchase code quotes and records. Shown to the owner and echoed back to accept it. */
export const MONTHLY_COST_USD = 1.15;
const E164 = /^\+[1-9]\d{6,14}$/;
const DEFAULT_MONTHLY_CAP = 5;
const MAX_MONTHLY_CAP = 50;

export function monthlyPurchaseCap(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(String(env.KLAROS_PHONE_MONTHLY_CAP ?? ''), 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MONTHLY_CAP;
  return Math.min(n, MAX_MONTHLY_CAP);
}

/** Digits only, +1 added for a bare 10-digit US number. Returns undefined for anything that is not a plausible E.164 number. */
export function normalizeE164(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().replace(/[\s().-]/g, '');
  const withPlus = /^\d{10}$/.test(s) ? `+1${s}` : s;
  return E164.test(withPlus) ? withPlus : undefined;
}

export type PhoneAction = 'status' | 'search' | 'buy' | 'set_business_number';

export interface PhoneRequest {
  klarosTenantId: string;
  action: PhoneAction;
  areaCode?: string;
  phoneNumber?: string;
  acceptedMonthlyCostUsd?: number;
  /** An E.164 number, or null/'' to remove it. */
  businessNumber?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: ReadonlyArray<string> = ['status', 'search', 'buy', 'set_business_number'];

/** Pure validation of the request body. Throws KlarosPhoneError(400). */
export function validatePhoneRequest(body: unknown): PhoneRequest {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const klarosTenantId = typeof b.klarosTenantId === 'string' ? b.klarosTenantId.trim().toLowerCase() : '';
  if (!UUID_RE.test(klarosTenantId)) throw new KlarosPhoneError('klarosTenantId must be a UUID.');
  const action = typeof b.action === 'string' ? b.action : '';
  if (!ACTIONS.includes(action)) throw new KlarosPhoneError('Unknown action.');
  const out: PhoneRequest = { klarosTenantId, action: action as PhoneAction };

  if (action === 'search') {
    const area = typeof b.areaCode === 'string' ? b.areaCode.replace(/\D/g, '') : '';
    if (area.length !== 3) throw new KlarosPhoneError('areaCode must be 3 digits.');
    out.areaCode = area;
  }
  if (action === 'buy') {
    const phone = normalizeE164(b.phoneNumber);
    if (!phone) throw new KlarosPhoneError('phoneNumber must be a number from the search results.');
    out.phoneNumber = phone;
    out.acceptedMonthlyCostUsd = typeof b.acceptedMonthlyCostUsd === 'number' ? b.acceptedMonthlyCostUsd : undefined;
  }
  if (action === 'set_business_number') {
    if (b.businessNumber === null || b.businessNumber === '' || b.businessNumber === undefined) {
      out.businessNumber = null;
    } else {
      const n = normalizeE164(b.businessNumber);
      if (!n) throw new KlarosPhoneError('Enter the business number with its country code, for example +14155550123.');
      out.businessNumber = n;
    }
  }
  return out;
}

const inFlightBuys = new Set<string>();

async function activeNumbers(tenantId: string): Promise<Array<{ phoneNumber: string; status: string; agent: string | null }>> {
  const r = await pool.query(
    `SELECT tpn.phone_number, tpn.status, a.name AS agent
       FROM public.tenant_phone_numbers tpn
       LEFT JOIN public.ai_agents a ON a.id = tpn.ai_agent_id
      WHERE tpn.tenant_id = $1 AND tpn.status = 'active' ORDER BY tpn.created_at`,
    [tenantId]
  );
  return r.rows.map((x: any) => ({ phoneNumber: x.phone_number, status: x.status, agent: x.agent ?? null }));
}

async function purchasesThisMonth(): Promise<number> {
  const r = await pool.query(
    `SELECT count(*)::int AS n
       FROM public.phone_number_logs l
       JOIN public.voice_tenants vt ON vt.id = l.tenant_id
      WHERE l.action = 'purchased' AND vt.metadata->>'provisioned_by' = 'klaros'
        AND l.created_at >= date_trunc('month', now())`
  );
  return Number(r.rows[0].n);
}

export async function phoneStatus(tenantId: string, env: NodeJS.ProcessEnv = process.env) {
  const numbers = await activeNumbers(tenantId);
  const t = (await pool.query(`SELECT transfer_phone_number, metadata FROM public.voice_tenants WHERE id = $1`, [tenantId])).rows[0];
  const sub = (await pool.query(
    `SELECT plan, status, trial_expires_at, trial_minutes_used FROM public.subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [tenantId]
  )).rows[0];
  const cap = monthlyPurchaseCap(env);
  const used = await purchasesThisMonth();
  return {
    numbers,
    businessNumber: (t?.metadata?.business_number as string | undefined) ?? null,
    humanHandoff: Boolean(t?.transfer_phone_number),
    plan: sub ? { plan: sub.plan, status: sub.status, trialExpiresAt: sub.trial_expires_at ?? null, trialMinutesUsed: sub.trial_minutes_used ?? 0 } : null,
    canBuy: numbers.length === 0 && used < cap && isTwilioConfigured() && isGatewayReadyForTwilio(),
    monthlyCostUsd: MONTHLY_COST_USD,
    template: await templateStatus(tenantId),
  };
}

export async function searchNumbers(areaCode: string) {
  if (!isTwilioConfigured()) throw new KlarosPhoneError('Phone numbers are not available right now.', 503, 'not_available');
  try {
    const found = await new PhoneProvisioningService().searchAvailable(areaCode, 5);
    return { numbers: found.map((n) => ({ phoneNumber: n.phoneNumber, friendlyName: n.friendlyName })), monthlyCostUsd: MONTHLY_COST_USD };
  } catch {
    throw new KlarosPhoneError('We could not search for numbers just now.', 502, 'search_failed');
  }
}

export async function buyNumber(
  tenantId: string,
  phoneNumber: string,
  acceptedMonthlyCostUsd: number | undefined,
  env: NodeJS.ProcessEnv = process.env
) {
  if (acceptedMonthlyCostUsd !== MONTHLY_COST_USD) {
    throw new KlarosPhoneError('The monthly cost must be accepted before a number is bought.', 400, 'cost_not_accepted');
  }
  if (!isTwilioConfigured() || !isGatewayReadyForTwilio()) throw new KlarosPhoneError('Phone numbers are not available right now.', 503, 'not_available');
  if (inFlightBuys.has(tenantId)) throw new KlarosPhoneError('A purchase for this business is already in progress.', 409, 'purchase_in_progress');
  inFlightBuys.add(tenantId);
  try {
    if ((await activeNumbers(tenantId)).length > 0) throw new KlarosPhoneError('This business already has a phone number.', 409, 'already_has_number');
    if ((await purchasesThisMonth()) >= monthlyPurchaseCap(env)) {
      throw new KlarosPhoneError('The monthly limit for new phone numbers has been reached. Please try again next month or contact support.', 429, 'monthly_cap_reached');
    }
    await ensureTrialSubscription(tenantId); // the existing purchase code sizes its limits from the plan
    let purchased;
    try {
      purchased = await new PhoneProvisioningService().purchaseNumber(tenantId, phoneNumber);
    } catch (err) {
      logger.warn('KLAROS_PHONE_BUY_FAILED', { tenantId, error: err instanceof Error ? err.name : 'error' });
      throw new KlarosPhoneError('The number could not be bought. It may have just been taken: search again.', 502, 'number_unavailable');
    }
    // Pin the Receptionist so the intake and consent flow answers, never another agent.
    const agent = await pool.query(`SELECT id FROM public.ai_agents WHERE tenant_id = $1 AND role = 'receptionist_intake' AND active = true LIMIT 1`, [tenantId]);
    if (agent.rows.length === 1) {
      await pool.query(`UPDATE public.tenant_phone_numbers SET ai_agent_id = $1 WHERE id = $2 AND tenant_id = $3`, [agent.rows[0].id, purchased.id, tenantId]);
    } else {
      logger.warn('KLAROS_PHONE_NO_RECEPTIONIST_TO_PIN', { tenantId });
    }
    logger.info('KLAROS_PHONE_BOUGHT', { tenantId, pinned: agent.rows.length === 1 });
    return { phoneNumber: purchased.phoneNumber, monthlyCostUsd: MONTHLY_COST_USD, receptionistPinned: agent.rows.length === 1 };
  } finally {
    inFlightBuys.delete(tenantId);
  }
}

/** Stores (or removes) the business's own existing number: the human hand-off line, and the line the owner forwards to the Halla number. */
export async function setBusinessNumber(tenantId: string, businessNumber: string | null) {
  if (businessNumber) {
    // Never hand callers to a Halla line: that would loop the call back into the AI.
    const clash = await pool.query(
      `SELECT 1 FROM public.tenant_phone_numbers WHERE phone_number = $1 UNION ALL SELECT 1 FROM public.voice_tenants WHERE phone_number = $1 LIMIT 1`,
      [businessNumber]
    );
    if (clash.rows.length > 0) throw new KlarosPhoneError('That number is already a Halla line. Enter the business\'s own phone number.', 409, 'is_halla_line');
  }
  await pool.query(
    `UPDATE public.voice_tenants
        SET transfer_phone_number = $2,
            metadata = CASE WHEN $2::text IS NULL THEN metadata - 'business_number' ELSE metadata || jsonb_build_object('business_number', $2::text) END,
            updated_at = now()
      WHERE id = $1`,
    [tenantId, businessNumber]
  );
  logger.info('KLAROS_BUSINESS_NUMBER_SET', { tenantId, set: Boolean(businessNumber) });
  return { businessNumber, humanHandoff: Boolean(businessNumber) };
}

export async function handlePhoneRequest(req: PhoneRequest, env: NodeJS.ProcessEnv = process.env) {
  const tenant = await findKlarosTenant(req.klarosTenantId);
  switch (req.action) {
    case 'status':
      return phoneStatus(tenant.id, env);
    case 'search':
      return searchNumbers(req.areaCode as string);
    case 'buy':
      return buyNumber(tenant.id, req.phoneNumber as string, req.acceptedMonthlyCostUsd, env);
    case 'set_business_number':
      return setBusinessNumber(tenant.id, req.businessNumber ?? null);
  }
}
