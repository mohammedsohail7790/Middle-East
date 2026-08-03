import { voiceDb } from '../voice/tenant-scope.js';

/**
 * Analytics Service
 * Calculate and aggregate metrics for dashboard analytics
 */

const pool = voiceDb;

export interface DashboardMetrics {
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  totalMinutes: number;
  avgCallDuration: number;
  totalLeads: number;
  qualifiedLeads: number;
  totalAppointments: number;
  confirmedAppointments: number;
  totalSms: number;
  totalRevenue: number;
  conversionRate: number;
}

export interface CallVolumeData {
  date: string;
  calls: number;
  leads: number;
  appointments: number;
}

export interface ConversionFunnel {
  calls: number;
  leads: number;
  qualified: number;
  appointments: number;
  confirmed: number;
}

export interface PeakHoursData {
  hour: number;
  calls: number;
  avgDuration: number;
}

export class AnalyticsService {
  /**
   * Get dashboard metrics for date range
   */
  async getDashboardMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardMetrics> {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as total_calls,
          COUNT(*) FILTER (WHERE outcome IN ('completed', 'transferred')) as answered_calls,
          COUNT(*) FILTER (WHERE outcome IN ('missed', 'no_answer', 'busy') OR outcome IS NULL) as missed_calls,
          COALESCE(SUM(duration_ms) / 60000.0, 0) as total_minutes,
          COALESCE(AVG(duration_ms) / 1000.0, 0) as avg_call_duration
         FROM public.calls
         WHERE tenant_id = $1
           AND created_at BETWEEN $2 AND $3`,
        [tenantId, startDate, endDate]
      );

      const leadsResult = await pool.query(
        `SELECT 
          COUNT(*) as total_leads,
          COUNT(*) FILTER (WHERE status IN ('qualified', 'won')) as qualified_leads
         FROM public.leads
         WHERE tenant_id = $1
           AND created_at BETWEEN $2 AND $3`,
        [tenantId, startDate, endDate]
      );

      const appointmentsResult = await pool.query(
        `SELECT 
          COUNT(*) as total_appointments,
          COUNT(*) FILTER (WHERE status IN ('confirmed', 'booked')) as confirmed_appointments
         FROM public.appointments
         WHERE tenant_id = $1
           AND created_at BETWEEN $2 AND $3`,
        [tenantId, startDate, endDate]
      );

      const smsResult = await pool.query(
        `SELECT COUNT(*) as total_sms
         FROM public.sms_messages
         WHERE tenant_id = $1
           AND created_at BETWEEN $2 AND $3`,
        [tenantId, startDate, endDate]
      );

      const callData = result.rows[0];
      const leadData = leadsResult.rows[0];
      const appointmentData = appointmentsResult.rows[0];
      const smsData = smsResult.rows[0];

      const totalCalls = parseInt(callData.total_calls) || 0;
      const totalLeads = parseInt(leadData.total_leads) || 0;
      const conversionRate = totalCalls > 0 ? (totalLeads / totalCalls) * 100 : 0;

      return {
        totalCalls,
        answeredCalls: parseInt(callData.answered_calls) || 0,
        missedCalls: parseInt(callData.missed_calls) || 0,
        totalMinutes: Math.round(parseFloat(callData.total_minutes) || 0),
        avgCallDuration: Math.round(parseFloat(callData.avg_call_duration) || 0),
        totalLeads,
        qualifiedLeads: parseInt(leadData.qualified_leads) || 0,
        totalAppointments: parseInt(appointmentData.total_appointments) || 0,
        confirmedAppointments: parseInt(appointmentData.confirmed_appointments) || 0,
        totalSms: parseInt(smsData.total_sms) || 0,
        totalRevenue: 0,
        conversionRate: Math.round(conversionRate * 100) / 100,
      };
    } catch (error) {
      console.error('[Analytics] Error getting dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Get call volume by date
   */
  async getCallVolumeByDate(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CallVolumeData[]> {
    try {
      const result = await pool.query(
        `WITH days AS (
           SELECT generate_series($2::date, $3::date, '1 day'::interval)::date AS day
         )
         SELECT
           days.day AS date,
           COUNT(DISTINCT c.id) AS calls,
           COUNT(DISTINCT l.id) AS leads,
           COUNT(DISTINCT a.id) AS appointments
         FROM days
         LEFT JOIN public.calls c
           ON c.tenant_id = $1 AND DATE(c.created_at) = days.day
         LEFT JOIN public.leads l
           ON l.tenant_id = $1 AND DATE(l.created_at) = days.day
         LEFT JOIN public.appointments a
           ON a.tenant_id = $1 AND DATE(a.created_at) = days.day
         GROUP BY days.day
         ORDER BY days.day`,
        [tenantId, startDate, endDate]
      );

      return result.rows.map((row) => ({
        date: row.date,
        calls: parseInt(row.calls) || 0,
        leads: parseInt(row.leads) || 0,
        appointments: parseInt(row.appointments) || 0,
      }));
    } catch (error) {
      console.error('[Analytics] Error getting call volume:', error);
      throw error;
    }
  }

  /**
   * Get conversion funnel
   */
  async getConversionFunnel(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ConversionFunnel> {
    try {
      const result = await pool.query(
        `SELECT
          (SELECT COUNT(*) FROM public.calls
           WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3) AS calls,
          (SELECT COUNT(*) FROM public.leads
           WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3) AS leads,
          (SELECT COUNT(*) FROM public.leads
           WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
             AND status IN ('qualified', 'won')) AS qualified,
          (SELECT COUNT(*) FROM public.appointments
           WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3) AS appointments,
          (SELECT COUNT(*) FROM public.appointments
           WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
             AND status IN ('confirmed', 'booked')) AS confirmed`,
        [tenantId, startDate, endDate]
      );

      const data = result.rows[0];
      return {
        calls: parseInt(data.calls) || 0,
        leads: parseInt(data.leads) || 0,
        qualified: parseInt(data.qualified) || 0,
        appointments: parseInt(data.appointments) || 0,
        confirmed: parseInt(data.confirmed) || 0,
      };
    } catch (error) {
      console.error('[Analytics] Error getting conversion funnel:', error);
      throw error;
    }
  }

  /**
   * Get peak hours (calls by hour of day)
   */
  async getPeakHours(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PeakHoursData[]> {
    try {
      const result = await pool.query(
        `SELECT
          EXTRACT(HOUR FROM created_at) AS hour,
          COUNT(*) AS calls,
          AVG(NULLIF(duration_ms, 0) / 1000.0) AS avg_duration
         FROM public.calls
         WHERE tenant_id = $1
           AND created_at BETWEEN $2 AND $3
         GROUP BY EXTRACT(HOUR FROM created_at)
         ORDER BY hour`,
        [tenantId, startDate, endDate]
      );

      return result.rows.map(row => ({
        hour: parseInt(row.hour),
        calls: parseInt(row.calls) || 0,
        avgDuration: Math.round(parseFloat(row.avg_duration) || 0),
      }));
    } catch (error) {
      console.error('[Analytics] Error getting peak hours:', error);
      throw error;
    }
  }

  /**
   * Calculate and store daily metrics
   */
  async calculateDailyMetrics(tenantId: string, date: Date): Promise<void> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const metrics = await this.getDashboardMetrics(tenantId, startOfDay, endOfDay);

      await pool.query(
        `INSERT INTO public.daily_metrics (
          tenant_id, date, total_calls, answered_calls, missed_calls,
          total_minutes, avg_call_duration, total_leads, qualified_leads,
          total_appointments, confirmed_appointments, total_sms,
          total_revenue, conversion_rate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (tenant_id, date) 
        DO UPDATE SET
          total_calls = EXCLUDED.total_calls,
          answered_calls = EXCLUDED.answered_calls,
          missed_calls = EXCLUDED.missed_calls,
          total_minutes = EXCLUDED.total_minutes,
          avg_call_duration = EXCLUDED.avg_call_duration,
          total_leads = EXCLUDED.total_leads,
          qualified_leads = EXCLUDED.qualified_leads,
          total_appointments = EXCLUDED.total_appointments,
          confirmed_appointments = EXCLUDED.confirmed_appointments,
          total_sms = EXCLUDED.total_sms,
          total_revenue = EXCLUDED.total_revenue,
          conversion_rate = EXCLUDED.conversion_rate`,
        [
          tenantId,
          date,
          metrics.totalCalls,
          metrics.answeredCalls,
          metrics.missedCalls,
          metrics.totalMinutes,
          metrics.avgCallDuration,
          metrics.totalLeads,
          metrics.qualifiedLeads,
          metrics.totalAppointments,
          metrics.confirmedAppointments,
          metrics.totalSms,
          metrics.totalRevenue,
          metrics.conversionRate,
        ]
      );

      console.log(`[Analytics] Calculated daily metrics for ${date.toISOString().split('T')[0]}`);
    } catch (error) {
      console.error('[Analytics] Error calculating daily metrics:', error);
      throw error;
    }
  }

  /**
   * Export metrics to CSV
   */
  async exportToCSV(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    try {
      const data = await this.getCallVolumeByDate(tenantId, startDate, endDate);
      
      let csv = 'Date,Calls,Leads,Appointments\n';
      data.forEach(row => {
        csv += `${row.date},${row.calls},${row.leads},${row.appointments}\n`;
      });

      return csv;
    } catch (error) {
      console.error('[Analytics] Error exporting to CSV:', error);
      throw error;
    }
  }

  /**
   * Export metrics report as PDF binary
   */
  async exportToPDF(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Buffer> {
    const { buildAnalyticsPdfBuffer } = await import('./analytics-pdf.js');
    const [metrics, volume] = await Promise.all([
      this.getDashboardMetrics(tenantId, startDate, endDate),
      this.getCallVolumeByDate(tenantId, startDate, endDate),
    ]);

    const period = `${startDate.toISOString().split('T')[0]} — ${endDate.toISOString().split('T')[0]}`;
    const avgSec = Math.round(metrics.avgCallDuration || 0);

    return buildAnalyticsPdfBuffer({
      title: 'Call IQ Analytics Report',
      period,
      kpis: [
        { label: 'Total Calls', value: String(metrics.totalCalls) },
        { label: 'Total Leads', value: String(metrics.totalLeads) },
        { label: 'Conversion Rate', value: `${metrics.conversionRate}%` },
        { label: 'Avg Call Duration', value: `${avgSec}s` },
        { label: 'Appointments', value: String(metrics.totalAppointments) },
      ],
      rows: volume.map((r) => ({
        date: r.date,
        calls: r.calls,
        leads: r.leads,
        appointments: r.appointments,
      })),
    });
  }
}

export const analyticsService = new AnalyticsService();

