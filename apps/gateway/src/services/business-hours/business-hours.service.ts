import { pool } from '../db/pool.js';
import {
  getBusinessHoursColumnSet,
  isMissingColumnError,
  isMissingRelationError,
  normalizeTimeForDb,
  openFlagDbValue,
  rowIsOpen,
} from './business-hours-schema.js';

export interface BusinessHours {
  id: string;
  tenantId: string;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  isOpen: boolean;
  timezone: string;
}

export interface Holiday {
  id: string;
  tenantId: string;
  name: string;
  date: Date;
  isRecurring: boolean;
}

export class BusinessHoursService {
  /**
   * Get business hours for tenant
   */
  async getBusinessHours(tenantId: string): Promise<BusinessHours[]> {
    try {
      const columns = await getBusinessHoursColumnSet(pool);
      const result = await pool.query(
        `SELECT id, tenant_id, day_of_week,
                ${columns.startCol} AS start_time,
                ${columns.endCol} AS end_time,
                ${columns.openCol} AS open_flag,
                timezone
         FROM public.business_hours
         WHERE tenant_id = $1
         ORDER BY day_of_week`,
        [tenantId]
      );

      return result.rows.map((row) => this.mapToBusinessHours(row, columns));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (isMissingRelationError(msg)) {
        console.warn('[BusinessHours] business_hours table missing', { tenantId });
        return [];
      }
      console.error('[BusinessHours] Error getting business hours:', error);
      throw error;
    }
  }

  /**
   * Update business hours
   */
  async updateBusinessHours(
    tenantId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    isOpen: boolean,
    timezone: string = 'America/New_York'
  ): Promise<BusinessHours> {
    const columns = await getBusinessHoursColumnSet(pool);
    const start = normalizeTimeForDb(startTime);
    const end = normalizeTimeForDb(endTime);
    const openFlagValue = openFlagDbValue(isOpen, columns);

    try {
      const result = await pool.query(
        `INSERT INTO public.business_hours (tenant_id, day_of_week, ${columns.startCol}, ${columns.endCol}, ${columns.openCol}, timezone)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, day_of_week)
         DO UPDATE SET
           ${columns.startCol} = $3,
           ${columns.endCol} = $4,
           ${columns.openCol} = $5,
           timezone = $6
         RETURNING id, tenant_id, day_of_week,
                   ${columns.startCol} AS start_time,
                   ${columns.endCol} AS end_time,
                   ${columns.openCol} AS open_flag,
                   timezone`,
        [tenantId, dayOfWeek, start, end, openFlagValue, timezone]
      );

      console.log(`[BusinessHours] Updated hours for day ${dayOfWeek}`);

      return this.mapToBusinessHours(result.rows[0], columns);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (isMissingRelationError(msg)) {
        throw new Error('Business hours are not available yet — apply database migrations or contact support.');
      }
      console.error('[BusinessHours] Error updating business hours:', error);
      throw error;
    }
  }

  /**
   * Check if currently open
   */
  async isCurrentlyOpen(tenantId: string): Promise<boolean> {
    try {
      const columns = await getBusinessHoursColumnSet(pool);
      const now = new Date();
      const dayOfWeek = now.getDay();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      const holidayResult = await pool.query(
        `SELECT id FROM public.holidays
         WHERE tenant_id = $1 AND date = CURRENT_DATE`,
        [tenantId]
      );

      if (holidayResult.rows.length > 0) {
        return false;
      }

      const result = await pool.query(
        `SELECT ${columns.openCol} AS open_flag,
                ${columns.startCol} AS start_time,
                ${columns.endCol} AS end_time
         FROM public.business_hours
         WHERE tenant_id = $1 AND day_of_week = $2`,
        [tenantId, dayOfWeek]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const row = result.rows[0];
      if (!rowIsOpen({ [columns.openCol]: row.open_flag }, columns)) {
        return false;
      }

      const start_time = String(row.start_time ?? '').slice(0, 5);
      const end_time = String(row.end_time ?? '').slice(0, 5);
      return currentTime >= start_time && currentTime <= end_time;
    } catch (error) {
      console.error('[BusinessHours] Error checking if open:', error);
      return false;
    }
  }

  /**
   * Get next available time
   */
  async getNextAvailableTime(tenantId: string): Promise<Date | null> {
    try {
      const columns = await getBusinessHoursColumnSet(pool);
      const now = new Date();
      const checkDate = new Date(now);

      for (let i = 0; i < 14; i++) {
        const dayOfWeek = checkDate.getDay();

        const holidayResult = await pool.query(
          `SELECT id FROM public.holidays
           WHERE tenant_id = $1 AND date = $2`,
          [tenantId, checkDate.toISOString().split('T')[0]]
        );

        if (holidayResult.rows.length === 0) {
          const result = await pool.query(
            `SELECT ${columns.openCol} AS open_flag,
                    ${columns.startCol} AS start_time,
                    timezone
             FROM public.business_hours
             WHERE tenant_id = $1 AND day_of_week = $2`,
            [tenantId, dayOfWeek]
          );

          const bhRow = result.rows[0];
          if (
            result.rows.length > 0 &&
            rowIsOpen({ [columns.openCol]: bhRow.open_flag }, columns)
          ) {
            const { start_time } = result.rows[0];
            const [hours, minutes] = String(start_time).split(':').map(Number);

            const nextAvailable = new Date(checkDate);
            nextAvailable.setHours(hours, minutes, 0, 0);

            if (nextAvailable > now) {
              return nextAvailable;
            }
          }
        }

        checkDate.setDate(checkDate.getDate() + 1);
        checkDate.setHours(0, 0, 0, 0);
      }

      return null;
    } catch (error) {
      console.error('[BusinessHours] Error getting next available time:', error);
      return null;
    }
  }

  /**
   * Get holidays
   */
  async getHolidays(tenantId: string): Promise<Holiday[]> {
    try {
      return await this.queryHolidays(
        `SELECT id, tenant_id, name, date, is_recurring
         FROM public.holidays
         WHERE tenant_id = $1
         ORDER BY date`,
        [tenantId]
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (isMissingColumnError(msg)) {
        return this.queryHolidays(
          `SELECT id, tenant_id, name, date, is_closed AS is_recurring
           FROM public.holidays
           WHERE tenant_id = $1
           ORDER BY date`,
          [tenantId],
          true
        );
      }
      console.error('[BusinessHours] Error getting holidays:', error);
      throw error;
    }
  }

  private async queryHolidays(
    sql: string,
    params: unknown[],
    invertRecurring = false
  ): Promise<Holiday[]> {
    const result = await pool.query(sql, params);
    return result.rows.map((row) => {
      const holiday = this.mapToHoliday(row);
      if (invertRecurring) {
        holiday.isRecurring = !row.is_recurring;
      }
      return holiday;
    });
  }

  /**
   * Add holiday
   */
  async addHoliday(
    tenantId: string,
    name: string,
    date: Date,
    isRecurring: boolean = false
  ): Promise<Holiday> {
    try {
      const result = await pool.query(
        `INSERT INTO public.holidays (tenant_id, name, date, is_recurring)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, name, date, is_recurring`,
        [tenantId, name, date, isRecurring]
      );

      console.log(`[BusinessHours] Holiday added: ${name}`);

      return this.mapToHoliday(result.rows[0]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (isMissingColumnError(msg)) {
        const result = await pool.query(
          `INSERT INTO public.holidays (tenant_id, name, date, is_closed)
           VALUES ($1, $2, $3, $4)
           RETURNING id, tenant_id, name, date, is_closed AS is_recurring`,
          [tenantId, name, date, !isRecurring]
        );
        const row = result.rows[0];
        const holiday = this.mapToHoliday(row);
        holiday.isRecurring = isRecurring;
        return holiday;
      }
      console.error('[BusinessHours] Error adding holiday:', error);
      throw error;
    }
  }

  /**
   * Delete holiday
   */
  async deleteHoliday(tenantId: string, holidayId: string): Promise<void> {
    try {
      await pool.query(
        'DELETE FROM public.holidays WHERE id = $1 AND tenant_id = $2',
        [holidayId, tenantId]
      );

      console.log(`[BusinessHours] Holiday deleted: ${holidayId}`);
    } catch (error) {
      console.error('[BusinessHours] Error deleting holiday:', error);
      throw error;
    }
  }

  /**
   * Initialize default business hours for tenant
   */
  async initializeDefaultHours(tenantId: string): Promise<void> {
    try {
      const defaultHours = [
        { day: 0, start: '09:00', end: '17:00', open: false },
        { day: 1, start: '09:00', end: '17:00', open: true },
        { day: 2, start: '09:00', end: '17:00', open: true },
        { day: 3, start: '09:00', end: '17:00', open: true },
        { day: 4, start: '09:00', end: '17:00', open: true },
        { day: 5, start: '09:00', end: '17:00', open: true },
        { day: 6, start: '09:00', end: '17:00', open: false },
      ];

      for (const hours of defaultHours) {
        await this.updateBusinessHours(
          tenantId,
          hours.day,
          hours.start,
          hours.end,
          hours.open
        );
      }

      console.log(`[BusinessHours] Default hours initialized for tenant ${tenantId}`);
    } catch (error) {
      console.error('[BusinessHours] Error initializing default hours:', error);
      throw error;
    }
  }

  private mapToBusinessHours(row: Record<string, unknown>, columns: Awaited<ReturnType<typeof getBusinessHoursColumnSet>>): BusinessHours {
    const startRaw = row.start_time ?? row.open_time;
    const endRaw = row.end_time ?? row.close_time;
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      dayOfWeek: Number(row.day_of_week),
      startTime: String(startRaw ?? '09:00').slice(0, 5),
      endTime: String(endRaw ?? '17:00').slice(0, 5),
      isOpen: rowIsOpen({ [columns.openCol]: row.open_flag }, columns),
      timezone: String(row.timezone || 'America/New_York'),
    };
  }

  private mapToHoliday(row: Record<string, unknown>): Holiday {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      name: String(row.name),
      date: row.date as Date,
      isRecurring: Boolean(row.is_recurring),
    };
  }
}

export const businessHoursService = new BusinessHoursService();
