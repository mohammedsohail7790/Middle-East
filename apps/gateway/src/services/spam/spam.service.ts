/**
 * Spam detection for inbound calls — blocks robocalls and excludes billing.
 */
import { pool } from '../db/pool.js';
import { logger } from '../logger.js';

export interface SpamCheckInput {
  tenantId: string;
  callSid: string;
  fromNumber: string;
  toNumber: string;
  stirVerstat?: string | null;
  stirPassport?: string | null;
}

export interface SpamCheckResult {
  isSpam: boolean;
  reason?: string;
}

export interface TenantSpamSettings {
  enabled: boolean;
  blockUnknownCaller: boolean;
  stirShakenRequired: boolean;
  customBlocklist: string[];
  customAllowlist: string[];
}

const DEFAULT_SETTINGS: TenantSpamSettings = {
  enabled: true,
  blockUnknownCaller: false,
  stirShakenRequired: false,
  customBlocklist: [],
  customAllowlist: [],
};

function normalizePhone(n: string): string {
  return String(n || '').replace(/\D/g, '');
}

function isAnonymousCaller(from: string): boolean {
  const f = from.toLowerCase();
  return !from || f === 'anonymous' || f === 'restricted' || f === 'unknown' || f === 'unavailable';
}

export async function getTenantSpamSettings(tenantId: string): Promise<TenantSpamSettings> {
  try {
    const { rows } = await pool.query(
      `SELECT enabled, block_unknown_caller, stir_shaken_required, custom_blocklist, custom_allowlist
       FROM public.tenant_spam_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    if (!rows[0]) return { ...DEFAULT_SETTINGS };
    const r = rows[0];
    return {
      enabled: r.enabled !== false,
      blockUnknownCaller: Boolean(r.block_unknown_caller),
      stirShakenRequired: Boolean(r.stir_shaken_required),
      customBlocklist: Array.isArray(r.custom_blocklist) ? r.custom_blocklist.map(String) : [],
      customAllowlist: Array.isArray(r.custom_allowlist) ? r.custom_allowlist.map(String) : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function isMissingRelation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /relation .* does not exist|42P01/i.test(msg);
}

export async function upsertTenantSpamSettings(
  tenantId: string,
  settings: Partial<TenantSpamSettings>
): Promise<TenantSpamSettings> {
  const current = await getTenantSpamSettings(tenantId);
  const next = { ...current, ...settings };
  try {
    await pool.query(
      `INSERT INTO public.tenant_spam_settings
         (tenant_id, enabled, block_unknown_caller, stir_shaken_required, custom_blocklist, custom_allowlist, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         block_unknown_caller = EXCLUDED.block_unknown_caller,
         stir_shaken_required = EXCLUDED.stir_shaken_required,
         custom_blocklist = EXCLUDED.custom_blocklist,
         custom_allowlist = EXCLUDED.custom_allowlist,
         updated_at = NOW()`,
      [
        tenantId,
        next.enabled,
        next.blockUnknownCaller,
        next.stirShakenRequired,
        JSON.stringify(next.customBlocklist),
        JSON.stringify(next.customAllowlist),
      ]
    );
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn('tenant_spam_settings table missing — run migration 041', { tenantId });
      return next;
    }
    throw err;
  }
  return next;
}

async function recentCallCount(tenantId: string, fromNumber: string, minutes: number): Promise<number> {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.call_spam_log
       WHERE tenant_id = $1 AND phone_number = $2 AND created_at > NOW() - ($3 || ' minutes')::interval`,
      [tenantId, fromNumber, String(minutes)]
    );
    return rows[0]?.c ?? 0;
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn('call_spam_log table missing — run migration 013', { tenantId });
      return 0;
    }
    throw err;
  }
}

export async function evaluateSpam(input: SpamCheckInput): Promise<SpamCheckResult> {
  const settings = await getTenantSpamSettings(input.tenantId);
  if (!settings.enabled) return { isSpam: false };

  const from = normalizePhone(input.fromNumber);
  const allowlist = settings.customAllowlist.map(normalizePhone).filter(Boolean);
  if (from && allowlist.includes(from)) return { isSpam: false };

  const blocklist = settings.customBlocklist.map(normalizePhone).filter(Boolean);
  if (from && blocklist.includes(from)) {
    return { isSpam: true, reason: 'custom_blocklist' };
  }

  if (settings.blockUnknownCaller && isAnonymousCaller(input.fromNumber)) {
    return { isSpam: true, reason: 'anonymous_caller' };
  }

  const stir = String(input.stirVerstat || '').toUpperCase();
  if (settings.stirShakenRequired && stir && stir !== 'TN-VALIDATION-PASSED' && stir !== 'A') {
    return { isSpam: true, reason: 'stir_shaken_failed' };
  }
  if (stir === 'TN-VALIDATION-FAILED' || stir === 'C') {
    return { isSpam: true, reason: 'stir_shaken_failed' };
  }

  // Rapid repeat from same number (robocall burst heuristic)
  if (from) {
    const recent = await recentCallCount(input.tenantId, from, 5);
    if (recent >= 8) {
      return { isSpam: true, reason: 'rapid_repeat_caller' };
    }
  }

  return { isSpam: false };
}

export async function logSpamCall(input: SpamCheckInput, reason: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO public.call_spam_log (tenant_id, call_sid, phone_number, reason)
       VALUES ($1, $2, $3, $4)`,
      [input.tenantId, input.callSid, input.fromNumber, reason]
    );
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn('call_spam_log table missing — run migration 013', {
        tenantId: input.tenantId,
        callSid: input.callSid,
      });
      return;
    }
    throw err;
  }
}

export async function markCallAsSpam(
  tenantId: string,
  callSid: string,
  fromNumber: string,
  reason: string
): Promise<void> {
  await logSpamCall({ tenantId, callSid, fromNumber, toNumber: '', stirVerstat: null }, reason);
  try {
    await pool.query(
      `UPDATE public.calls SET is_spam = true, spam_reason = $3, outcome = 'spam'
       WHERE tenant_id = $1 AND call_sid = $2`,
      [tenantId, callSid, reason]
    );
  } catch (err) {
    logger.warn('markCallAsSpam: calls row may not exist yet', { callSid, error: String(err) });
  }
}

export async function listSpamLog(
  tenantId: string,
  limit = 50
): Promise<Array<{ id: string; callSid: string; phoneNumber: string; reason: string; createdAt: string }>> {
  try {
    const { rows } = await pool.query(
      `SELECT id, call_sid, phone_number, reason, created_at
       FROM public.call_spam_log WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit]
    );
    return rows.map((r) => ({
      id: r.id,
      callSid: r.call_sid,
      phoneNumber: r.phone_number,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn('call_spam_log table missing — run migration 013', { tenantId });
      return [];
    }
    throw err;
  }
}

export function spamRejectTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Reject reason="busy"/>
</Response>`;
}
