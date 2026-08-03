/**
 * Scheduled Reports Service
 * Manages automated email reports for enterprise clients.
 */

import { pool } from '../db/pool.js';

export interface ScheduledReport {
  id: string;
  tenantId: string;
  name: string;
  reportType: string;
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  recipients: string[];
  format: string;
  includeRawData: boolean;
  active: boolean;
  lastSentAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ScheduledReportsService {
  async create(tenantId: string, data: {
    name: string; reportType: string; frequency: string; recipients: string[];
    dayOfWeek?: number; dayOfMonth?: number; timeOfDay?: string;
    format?: string; includeRawData?: boolean;
  }): Promise<ScheduledReport> {
    const result = await pool.query(
      `INSERT INTO public.scheduled_reports 
       (tenant_id, name, report_type, frequency, day_of_week, day_of_month, time_of_day, recipients, format, include_raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, tenant_id, name, report_type, frequency, day_of_week, day_of_month, time_of_day, recipients, format, include_raw_data, active, last_sent_at, last_error, created_at, updated_at`,
      [
        tenantId, data.name, data.reportType, data.frequency,
        data.dayOfWeek || null, data.dayOfMonth || null, data.timeOfDay || '09:00:00',
        JSON.stringify(data.recipients), data.format || 'pdf', data.includeRawData || false,
      ]
    );
    return this.mapRow(result.rows[0]);
  }

  async list(tenantId: string): Promise<ScheduledReport[]> {
    const result = await pool.query(
      `SELECT id, tenant_id, name, report_type, frequency, day_of_week, day_of_month, time_of_day, recipients, format, include_raw_data, active, last_sent_at, last_error, created_at, updated_at
       FROM public.scheduled_reports WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map((row: any) => this.mapRow(row));
  }

  async update(tenantId: string, reportId: string, data: Partial<ScheduledReport>): Promise<ScheduledReport> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    const mappings: [string, any][] = [
      ['name', data.name], ['report_type', data.reportType], ['frequency', data.frequency],
      ['day_of_week', (data as any).dayOfWeek], ['day_of_month', (data as any).dayOfMonth],
      ['time_of_day', (data as any).timeOfDay], ['recipients', data.recipients ? JSON.stringify(data.recipients) : undefined],
      ['format', data.format], ['include_raw_data', data.includeRawData], ['active', data.active],
    ];

    for (const [col, val] of mappings) {
      if (val !== undefined) { fields.push(`${col} = $${i++}`); values.push(val); }
    }
    fields.push(`updated_at = NOW()`);
    values.push(reportId, tenantId);

    const result = await pool.query(
      `UPDATE public.scheduled_reports SET ${fields.join(', ')} WHERE id = $${i++} AND tenant_id = $${i++}
       RETURNING id, tenant_id, name, report_type, frequency, day_of_week, day_of_month, time_of_day, recipients, format, include_raw_data, active, last_sent_at, last_error, created_at, updated_at`,
      values
    );
    if (result.rows.length === 0) throw new Error('Report not found');
    return this.mapRow(result.rows[0]);
  }

  async delete(tenantId: string, reportId: string): Promise<void> {
    await pool.query(`DELETE FROM public.scheduled_reports WHERE id = $1 AND tenant_id = $2`, [reportId, tenantId]);
  }

  /**
   * Get reports that are due to run now. Called by cron.
   */
  async getDueReports(): Promise<ScheduledReport[]> {
    const result = await pool.query(
      `SELECT id, tenant_id, name, report_type, frequency, day_of_week, day_of_month, time_of_day, recipients, format, include_raw_data, active, last_sent_at, last_error, created_at, updated_at
       FROM public.scheduled_reports
       WHERE active = true
         AND (
           (frequency = 'daily' AND time_of_day <= CURRENT_TIME)
           OR (frequency = 'weekly' AND EXTRACT(DOW FROM NOW()) = day_of_week AND time_of_day <= CURRENT_TIME)
           OR (frequency = 'monthly' AND EXTRACT(DAY FROM NOW()) = day_of_month AND time_of_day <= CURRENT_TIME)
         )
         AND (last_sent_at IS NULL OR last_sent_at < NOW() - INTERVAL '20 hours')`
    );
    return result.rows.map((row: any) => this.mapRow(row));
  }

  /**
   * Mark a report as sent.
   */
  async markSent(reportId: string): Promise<void> {
    await pool.query(`UPDATE public.scheduled_reports SET last_sent_at = NOW(), last_error = NULL WHERE id = $1`, [reportId]);
  }

  async markFailed(reportId: string, error: string): Promise<void> {
    await pool.query(`UPDATE public.scheduled_reports SET last_error = $1 WHERE id = $2`, [error, reportId]);
  }

  private mapRow(row: any): ScheduledReport {
    return {
      id: row.id, tenantId: row.tenant_id, name: row.name, reportType: row.report_type,
      frequency: row.frequency, dayOfWeek: row.day_of_week, dayOfMonth: row.day_of_month,
      timeOfDay: row.time_of_day, recipients: row.recipients || [], format: row.format,
      includeRawData: row.include_raw_data, active: row.active,
      lastSentAt: row.last_sent_at, lastError: row.last_error,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }
}

export const scheduledReportsService = new ScheduledReportsService();

