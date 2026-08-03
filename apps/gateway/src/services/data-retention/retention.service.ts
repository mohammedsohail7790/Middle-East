import { pool } from '../db/pool.js';
import { logger } from '../logger.js';

/**
 * Data Retention Service
 * Manages data retention policies and automated cleanup.
 */

export interface RetentionPolicy {
  id: string;
  tenantId: string;
  callRecordingsDays: number;
  callTranscriptsDays: number;
  leadDataDays: number;
  smsMessagesDays: number;
  analyticsDays: number;
  enabled: boolean;
  updatedAt: Date;
}

export class DataRetentionService {
  async getPolicy(tenantId: string): Promise<RetentionPolicy | null> {
    const result = await pool.query(
      `SELECT id, tenant_id, call_recordings_days, call_transcripts_days, lead_data_days, sms_messages_days, analytics_days, enabled, updated_at
       FROM public.data_retention_policies WHERE tenant_id = $1`,
      [tenantId]
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async upsertPolicy(tenantId: string, data: Partial<RetentionPolicy>): Promise<RetentionPolicy> {
    const fields = ['tenant_id'];
    const values: any[] = [tenantId];
    const updates: string[] = [];

    const mappings: [string, any][] = [
      ['call_recordings_days', data.callRecordingsDays],
      ['call_transcripts_days', data.callTranscriptsDays],
      ['lead_data_days', data.leadDataDays],
      ['sms_messages_days', data.smsMessagesDays],
      ['analytics_days', data.analyticsDays],
      ['enabled', data.enabled],
    ];

    for (const [col, val] of mappings) {
      if (val !== undefined) {
        fields.push(col);
        values.push(val);
        updates.push(`${col} = EXCLUDED.${col}`);
      }
    }

    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `INSERT INTO public.data_retention_policies (${fields.join(', ')})
       VALUES (${values.map((_, idx) => `$${idx + 1}`).join(', ')})
       ON CONFLICT (tenant_id) DO UPDATE SET ${updates.join(', ')}
       RETURNING id, tenant_id, call_recordings_days, call_transcripts_days, lead_data_days, sms_messages_days, analytics_days, enabled, updated_at`,
      values
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Execute cleanup for all tenants with enabled policies.
   * Called via cron job (e.g., every hour).
   */
  async executeCleanup(): Promise<{ cleaned: number; skipped?: boolean }> {
    const exists = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'cleanup_retention_data'
       ) AS exists`
    );
    const hasCleanupFn = Boolean((exists.rows[0] as { exists?: boolean } | undefined)?.exists);
    if (!hasCleanupFn) {
      logger.warn('RETENTION_CLEANUP_FUNCTION_MISSING', {
        hint: 'Apply supabase/migrations/033_retention_cleanup_function.sql in Supabase SQL Editor',
      });
      return { cleaned: 0, skipped: true };
    }
    await pool.query(`SELECT public.cleanup_retention_data()`);
    return { cleaned: 1 };
  }

  private mapRow(row: any): RetentionPolicy {
    return {
      id: row.id, tenantId: row.tenant_id,
      callRecordingsDays: row.call_recordings_days,
      callTranscriptsDays: row.call_transcripts_days,
      leadDataDays: row.lead_data_days,
      smsMessagesDays: row.sms_messages_days,
      analyticsDays: row.analytics_days,
      enabled: row.enabled,
      updatedAt: row.updated_at,
    };
  }
}

export const dataRetentionService = new DataRetentionService();

