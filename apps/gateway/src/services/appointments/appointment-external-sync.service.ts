import { voiceDb } from '../voice/tenant-scope.js';
import { googleCalendarService } from '../calendar/google.calendar.service.js';
import { logger } from '../logger.js';

const SYNC_TIMEOUT_MS = Number(process.env.VOICE_EXTERNAL_CALENDAR_SYNC_TIMEOUT_MS || 4000);

export interface ExternalCalendarSyncInput {
  tenantId: string;
  appointmentId: string;
  name: string;
  phone: string;
  email?: string;
  service: string;
  start: Date;
  end: Date;
}

export interface ExternalCalendarSyncResult {
  provider: string;
  success: boolean;
  externalId?: string;
  error?: string;
}

function plusMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Push a booked appointment to every connected external calendar (Google, Outlook, Acuity). */
export async function syncAppointmentToExternalCalendars(
  input: ExternalCalendarSyncInput
): Promise<ExternalCalendarSyncResult[]> {
  const results: ExternalCalendarSyncResult[] = [];
  const title = `${input.service} — ${input.name}`;
  const description = `Phone: ${input.phone}\nService: ${input.service}\nHalla AI appointment ${input.appointmentId}`;

  if (await googleCalendarService.hasConnection(input.tenantId)) {
    try {
      const externalId = await withTimeout(
        googleCalendarService.createEvent(input.tenantId, {
          summary: title,
          start: input.start,
          end: input.end,
          description,
        }),
        SYNC_TIMEOUT_MS
      );
      if (externalId) {
        await voiceDb.query(
          `UPDATE public.appointments SET calendar_event_id = $1, calendar_provider = 'google' WHERE id = $2 AND tenant_id = $3`,
          [externalId, input.appointmentId, input.tenantId]
        );
        results.push({ provider: 'google-calendar', success: true, externalId });
      } else {
        results.push({ provider: 'google-calendar', success: false, error: 'sync_timeout' });
      }
    } catch (err) {
      results.push({
        provider: 'google-calendar',
        success: false,
        error: String(err),
      });
    }
  }

  try {
    const { outlookCalendarService } = await import('../calendar/outlook.calendar.service.js');
    const outlookConn = await outlookCalendarService.getConnection(input.tenantId);
    if (outlookConn) {
      const event = await withTimeout(
        outlookCalendarService.createEvent(
          input.tenantId,
          title,
          input.start,
          input.end,
          undefined,
          input.phone,
          description
        ),
        SYNC_TIMEOUT_MS
      );
      if (event?.externalId) {
        await voiceDb.query(
          `UPDATE public.appointments
           SET external_calendar_event_id = COALESCE(external_calendar_event_id, $1),
               calendar_provider = 'outlook'
           WHERE id = $2 AND tenant_id = $3`,
          [event.externalId, input.appointmentId, input.tenantId]
        );
        results.push({ provider: 'outlook', success: true, externalId: event.externalId });
      } else {
        results.push({ provider: 'outlook', success: false, error: 'sync_timeout' });
      }
    }
  } catch (err) {
    results.push({ provider: 'outlook', success: false, error: String(err) });
  }

  try {
    const { acuityService } = await import('../calendar/acuity.service.js');
    const acuityConn = await acuityService.getConnection(input.tenantId);
    if (acuityConn) {
      const types = await acuityService.getAppointmentTypes(input.tenantId);
      const typeId = String(types?.[0]?.id || '');
      if (typeId) {
        const appt = await withTimeout(
          acuityService.createAppointment(
            input.tenantId,
            typeId,
            input.start.toISOString(),
            input.name,
            input.email || '',
            input.phone
          ),
          SYNC_TIMEOUT_MS
        );
        if (appt?.id) {
          await voiceDb.query(
            `UPDATE public.appointments
             SET external_calendar_event_id = COALESCE(external_calendar_event_id, $1),
                 calendar_provider = 'acuity'
             WHERE id = $2 AND tenant_id = $3`,
            [String(appt.id), input.appointmentId, input.tenantId]
          );
          results.push({ provider: 'acuity', success: true, externalId: String(appt.id) });
        } else {
          results.push({ provider: 'acuity', success: false, error: 'sync_timeout' });
        }
      }
    }
  } catch (err) {
    results.push({ provider: 'acuity', success: false, error: String(err) });
  }

  if (results.length) {
    logger.info('APPOINTMENT_EXTERNAL_CALENDAR_SYNC', {
      tenantId: input.tenantId,
      appointmentId: input.appointmentId,
      results,
    });
  }

  return results;
}

export { plusMinutes };
