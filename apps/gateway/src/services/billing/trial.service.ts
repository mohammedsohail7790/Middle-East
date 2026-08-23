import { pool } from '../db/pool.js';
import { logger } from '../logger.js';

export interface TrialStatus {
  isTrialing: boolean;
  hasSubscription: boolean;
  trialStartedAt: Date | null;
  trialExpiresAt: Date | null;
  trialMinutesUsed: number;
  trialMinutesLimit: number;
  trialMinutesRemaining: number;
  trialDaysLimit: number;
  trialExpired: boolean;
  trialMinutesExhausted: boolean;
  daysRemaining: number;
  usagePercent: number;
  plan: string;
  status: string;
  isLocked: boolean;
  blockReason: string | null;
}

export interface WarningResult {
  id: string;
  warningType: string;
  message: string;
  details: any;
  acknowledged: boolean;
  createdAt: Date;
}

const TRIAL_USAGE_WARNINGS: Array<{ threshold: number; type: string }> = [
  { threshold: 40, type: 'trial_40_minutes' },
  { threshold: 50, type: 'trial_50_minutes' },
  { threshold: 55, type: 'trial_55_minutes' },
  { threshold: 58, type: 'trial_58_minutes' },
];

export class TrialManager {
  private readonly TRIAL_MINUTES_LIMIT = 60;
  private readonly TRIAL_DAYS_LIMIT = 14;

  private emptyTrialStatus(): TrialStatus {
    return {
      isTrialing: false,
      hasSubscription: false,
      trialStartedAt: null,
      trialExpiresAt: null,
      trialMinutesUsed: 0,
      trialMinutesLimit: this.TRIAL_MINUTES_LIMIT,
      trialMinutesRemaining: this.TRIAL_MINUTES_LIMIT,
      trialDaysLimit: this.TRIAL_DAYS_LIMIT,
      trialExpired: false,
      trialMinutesExhausted: false,
      daysRemaining: 0,
      usagePercent: 0,
      plan: 'none',
      status: 'none',
      isLocked: false,
      blockReason: null,
    };
  }

  async getTrialStatus(tenantId: string): Promise<TrialStatus> {
    let result;
    try {
      result = await pool.query(
        `SELECT id, plan, status, trial_started_at, trial_expires_at, trial_minutes_used, created_at
         FROM public.subscriptions
         WHERE tenant_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId]
      );
    } catch (err) {
      const msg = String(err);
      if (!/column|does not exist|42P01|relation/i.test(msg)) throw err;
      try {
        result = await pool.query(
          `SELECT id, plan, status, created_at
           FROM public.subscriptions
           WHERE tenant_id = $1
           ORDER BY created_at DESC LIMIT 1`,
          [tenantId]
        );
      } catch {
        return this.emptyTrialStatus();
      }
    }

    if (result.rows.length === 0) {
      return {
        isTrialing: false,
        hasSubscription: false,
        trialStartedAt: null,
        trialExpiresAt: null,
        trialMinutesUsed: 0,
        trialMinutesLimit: this.TRIAL_MINUTES_LIMIT,
        trialMinutesRemaining: this.TRIAL_MINUTES_LIMIT,
        trialDaysLimit: this.TRIAL_DAYS_LIMIT,
        trialExpired: false,
        trialMinutesExhausted: false,
        daysRemaining: 0,
        usagePercent: 0,
        plan: 'none',
        status: 'none',
        isLocked: false,
        blockReason: null,
      };
    }

    const row = result.rows[0];
    const isTrialing = row.status === 'trialing';
    const isPaused = row.status === 'paused';
    const trialMinutesUsed = row.trial_minutes_used || 0;

    // Also count from minutes_accounting for accuracy
    let accurateMinutesUsed = trialMinutesUsed;
    try {
      const accountingResult = await pool.query(
        `SELECT COALESCE(SUM(billed_minutes), 0) as total
         FROM public.minutes_accounting
         WHERE tenant_id = $1 AND is_trial = true`,
        [tenantId]
      );
      accurateMinutesUsed = Math.max(
        trialMinutesUsed,
        parseInt(accountingResult.rows[0]?.total || '0', 10)
      );
    } catch (err) {
      // minutes_accounting is genuinely optional on older DBs — don't log that
      // expected case, but a real query failure here silently under-reports
      // trial usage, so surface anything else.
      const msg = String(err);
      if (!/relation|does not exist|42P01|column/i.test(msg)) {
        logger.warn('TRIAL_MINUTES_ACCOUNTING_QUERY_FAILED', { tenantId, error: msg });
      }
    }

    const now = new Date();
    const trialExpiresAt = row.trial_expires_at ? new Date(row.trial_expires_at) : null;
    const trialExpired = isPaused || (trialExpiresAt ? trialExpiresAt < now : !isTrialing);
    const minutesExhausted = accurateMinutesUsed >= this.TRIAL_MINUTES_LIMIT;
    const daysRemaining = trialExpiresAt
      ? Math.max(0, Math.ceil((trialExpiresAt.getTime() - now.getTime()) / 86400000))
      : 0;
    const minutesRemaining = Math.max(0, this.TRIAL_MINUTES_LIMIT - accurateMinutesUsed);
    const usagePercent = Math.min(
      100,
      Math.round((accurateMinutesUsed / this.TRIAL_MINUTES_LIMIT) * 100)
    );
    const isLocked = isPaused || (isTrialing && (trialExpired || minutesExhausted));
    let blockReason: string | null = null;
    if (isLocked) {
      blockReason = minutesExhausted
        ? 'Your free trial minutes have been used up.'
        : 'Your 14-day free trial has ended.';
    }

    return {
      isTrialing: isTrialing && !isPaused,
      hasSubscription: true,
      trialStartedAt: row.trial_started_at ? new Date(row.trial_started_at) : null,
      trialExpiresAt,
      trialMinutesUsed: accurateMinutesUsed,
      trialMinutesLimit: this.TRIAL_MINUTES_LIMIT,
      trialMinutesRemaining: minutesRemaining,
      trialDaysLimit: this.TRIAL_DAYS_LIMIT,
      trialExpired,
      trialMinutesExhausted: minutesExhausted,
      daysRemaining,
      usagePercent,
      plan: row.plan,
      status: row.status,
      isLocked,
      blockReason,
    };
  }

  async isTrialBlocked(tenantId: string): Promise<{ blocked: boolean; reason?: string }> {
    const status = await this.getTrialStatus(tenantId);
    return this.evaluateTrialBlock(status);
  }

  /**
   * Pure variant of isTrialBlocked() for callers that already have a
   * TrialStatus in hand (e.g. getAccountState(), which batches several
   * independent reads via Promise.all) -- avoids re-fetching the same
   * subscription/minutes_accounting rows a second time per request.
   */
  evaluateTrialBlock(status: TrialStatus): { blocked: boolean; reason?: string } {
    if (status.isLocked && status.blockReason) {
      return { blocked: true, reason: status.blockReason };
    }

    if (!status.isTrialing) {
      return { blocked: false };
    }

    if (status.trialExpired) {
      return { blocked: true, reason: 'Your 14-day free trial has ended.' };
    }

    if (status.trialMinutesExhausted) {
      return { blocked: true, reason: 'Your free trial minutes have been used up.' };
    }

    return { blocked: false };
  }

  /** End trial: pause subscription, block voice, keep dashboard login */
  async expireTrialIfNeeded(tenantId: string): Promise<boolean> {
    const block = await this.isTrialBlocked(tenantId);
    if (!block.blocked) return false;

    const status = await this.getTrialStatus(tenantId);
    if (status.status === 'paused') return true;

    const blockReason = status.trialMinutesExhausted
      ? 'trial_minutes_exhausted'
      : 'trial_expired';

    await pool.query(
      `UPDATE public.subscriptions
       SET status = 'paused', updated_at = NOW()
       WHERE tenant_id = $1 AND status = 'trialing'`,
      [tenantId]
    );

    await pool.query(
      `UPDATE public.voice_tenants
       SET billing_block_reason = $2, updated_at = NOW()
       WHERE id = $1`,
      [tenantId, blockReason]
    );

    const existing = await this.hasWarning(tenantId, 'trial_expired');
    if (!existing) {
      await this.createWarning(
        tenantId,
        'trial_expired',
        status.trialMinutesExhausted
          ? `Your free trial ended — you've used all ${status.trialMinutesLimit} minutes. Upgrade to keep your AI receptionist live.`
          : `Your 14-day free trial has ended. Upgrade to restore calls, workflows, and integrations.`,
        {
          minutesUsed: status.trialMinutesUsed,
          minutesLimit: status.trialMinutesLimit,
          daysUsed: status.trialDaysLimit - status.daysRemaining,
        }
      );
    }

    logger.info('Trial expired for tenant', { tenantId, blockReason });
    return true;
  }

  async afterUsageRecorded(tenantId: string): Promise<void> {
    await this.checkAndGenerateWarnings(tenantId);
    await this.expireTrialIfNeeded(tenantId);
  }

  async checkAndGenerateWarnings(tenantId: string): Promise<WarningResult[]> {
    const warnings: WarningResult[] = [];
    const status = await this.getTrialStatus(tenantId);

    if (!status.isTrialing) return warnings;

    const remaining = status.trialMinutesRemaining;
    const usagePercent = status.usagePercent;

    const existingTypes = await this.getActiveWarningTypes(tenantId);

    for (const { threshold, type } of TRIAL_USAGE_WARNINGS) {
      if (status.trialMinutesUsed < threshold) continue;
      if (existingTypes.has(type)) continue;

      const urgency =
        threshold >= 58
          ? 'Almost out of trial minutes'
          : threshold >= 55
            ? 'Trial minutes running low'
            : 'Trial usage update';

      const w = await this.createWarning(
        tenantId,
        type,
        `${urgency}: ${status.trialMinutesUsed} of ${status.trialMinutesLimit} minutes used (${remaining} left, ${status.daysRemaining} day(s) on trial). Upgrade to avoid interruption.`,
        {
          minutesUsed: status.trialMinutesUsed,
          minutesRemaining: remaining,
          daysRemaining: status.daysRemaining,
          usagePercent,
          threshold,
        }
      );
      warnings.push(w);
    }

    return warnings;
  }

  async checkAndGeneratePlanWarnings(tenantId: string): Promise<WarningResult[]> {
    const warnings: WarningResult[] = [];
    const result = await pool.query(
      `SELECT u.plan, u.included_minutes, ma.used
       FROM public.subscriptions u
       LEFT JOIN (
         SELECT tenant_id, COALESCE(SUM(billed_minutes), 0) as used
         FROM public.minutes_accounting
         WHERE tenant_id = $1 AND is_trial = false
         GROUP BY tenant_id
       ) ma ON ma.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.status = 'active'`,
      [tenantId]
    );

    if (result.rows.length === 0) return warnings;

    const row = result.rows[0];
    const included = row.included_minutes || 0;
    if (included === 0) return warnings;

    const used = parseInt(row.used || '0', 10);
    const percent = (used / included) * 100;

    // Warning at 90%
    if (percent >= 90 && percent < 100) {
      const existing = await this.hasWarning(tenantId, 'usage_90_percent');
      if (!existing) {
        const remaining = included - used;
        const w = await this.createWarning(tenantId, 'usage_90_percent',
          `You've used ${used} of ${included} included minutes (${Math.round(percent)}%). ${remaining} minutes remaining before overage charges apply.`,
          { minutesUsed: used, includedMinutes: included, minutesRemaining: remaining, usagePercent: Math.round(percent) }
        );
        warnings.push(w);
      }
    }

    // Warning at 100%
    if (percent >= 100) {
      const existing = await this.hasWarning(tenantId, 'usage_100_percent');
      if (!existing) {
        const overageMinutes = used - included;
        const w = await this.createWarning(tenantId, 'usage_100_percent',
          `You've used all ${included} included minutes. Overage charges now apply for additional usage. ${overageMinutes} overage minute(s) so far.`,
          { minutesUsed: used, includedMinutes: included, overageMinutes, usagePercent: Math.round(percent) }
        );
        warnings.push(w);
      }
    }

    return warnings;
  }

  async getWarnings(tenantId: string, unacknowledgedOnly = false): Promise<WarningResult[]> {
    let query = `SELECT id, warning_type, message, details, acknowledged, created_at
                 FROM public.billing_warnings
                 WHERE tenant_id = $1`;
    if (unacknowledgedOnly) {
      query += ' AND NOT acknowledged';
    }
    query += ' ORDER BY created_at DESC LIMIT 20';

    let result;
    try {
      result = await pool.query(query, [tenantId]);
    } catch (err) {
      const msg = String(err);
      if (/relation|does not exist|42P01/i.test(msg)) return [];
      throw err;
    }
    return result.rows.map((r: any) => ({
      id: r.id,
      warningType: r.warning_type,
      message: r.message,
      details: r.details,
      acknowledged: r.acknowledged,
      createdAt: r.created_at,
    }));
  }

  async acknowledgeWarning(tenantId: string, warningId: string): Promise<void> {
    await pool.query(
      `UPDATE public.billing_warnings
       SET acknowledged = true, acknowledged_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [warningId, tenantId]
    );
  }

  async acknowledgeAllWarnings(tenantId: string): Promise<void> {
    await pool.query(
      `UPDATE public.billing_warnings
       SET acknowledged = true, acknowledged_at = NOW()
       WHERE tenant_id = $1 AND NOT acknowledged`,
      [tenantId]
    );
  }

  private async getActiveWarningTypes(tenantId: string): Promise<Set<string>> {
    const result = await pool.query(
      `SELECT warning_type FROM public.billing_warnings
       WHERE tenant_id = $1
         AND NOT acknowledged
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [tenantId]
    );
    return new Set(result.rows.map((r: { warning_type: string }) => r.warning_type));
  }

  private async hasWarning(tenantId: string, warningType: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM public.billing_warnings
       WHERE tenant_id = $1 AND warning_type = $2
         AND NOT acknowledged
         AND created_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [tenantId, warningType]
    );
    return result.rows.length > 0;
  }

  async createWarning(tenantId: string, warningType: string, message: string, details: any): Promise<WarningResult> {
    const result = await pool.query(
      `INSERT INTO public.billing_warnings (tenant_id, warning_type, message, details)
       VALUES ($1, $2, $3, $4)
       RETURNING id, warning_type, message, details, acknowledged, created_at`,
      [tenantId, warningType, message, JSON.stringify(details)]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      warningType: row.warning_type,
      message: row.message,
      details: row.details,
      acknowledged: row.acknowledged,
      createdAt: row.created_at,
    };
  }
}

export const trialManager = new TrialManager();
