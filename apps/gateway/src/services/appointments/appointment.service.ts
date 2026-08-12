import { voiceDb } from '../voice/tenant-scope.js';
import { googleCalendarService } from '../calendar/google.calendar.service.js';
import { calendarService } from '../calendar/calendar.service.js';
import { logger } from '../logger.js';
import { logAppointmentWrite } from '../observability/validation-telemetry.js';
import { patchCorrelation } from '../observability/correlation-context.js';
import { invalidateTenantAvailabilityCache } from './tenant-availability.service.js';

const GOOGLE_AVAIL_TIMEOUT_MS = Number(process.env.VOICE_GOOGLE_AVAIL_TIMEOUT_MS || 2500);

export interface AppointmentInput {
    tenantId: string;
    name: string;
    phone: string;
    /** Caller email captured on the call — stored on the lead so confirmations/reminders can be emailed. */
    email?: string;
    service: string;
    time: string;
    /** Twilio call SID for CRM correlation (preferred over appointment UUID). */
    callSid?: string;
}

export interface AppointmentResult {
    success: boolean;
    message: string;
    appointmentId?: string;
    scheduledTime?: string;
    alternativeTime?: string;
}

/** Parse caller-provided time; allows ~2 min clock skew. */
export function parseAppointmentTime(input: string): Date | null {
    const trimmed = String(input ?? '').trim();
    if (!trimmed || trimmed.toLowerCase() === 'booked') return null;
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getTime() < Date.now() - 2 * 60 * 1000) return null;
    return date;
}

function parseFutureDate(input: string): Date | null {
    return parseAppointmentTime(input);
}

function plusMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

async function syncLeadAfterBooking(
    tenantId: string,
    phone: string,
    name: string,
    service: string,
    scheduledTime: string,
    appointmentId: string,
    email?: string
): Promise<void> {
    const { leadsService } = await import('../leads/leads.service.js');
    const existing = await leadsService.createLead(tenantId, phone, 'inbound_call', {
        name,
        email,
        service,
        notes: `Appointment: ${service} @ ${scheduledTime}`,
        metadata: {
            appointmentBooked: true,
            service,
            appointmentId,
        },
    });
    try {
        await leadsService.updateLeadStatus(tenantId, existing.id, 'appointment_set');
    } catch (statusErr) {
        logger.warn('APPOINTMENT_LEAD_STATUS_UPDATE_FAILED', {
            tenantId,
            leadId: existing.id,
            error: String(statusErr),
        });
    }
}

export interface RescheduleLookup {
    appointmentId?: string;
    phone?: string;
}

export class AppointmentService {
    async checkAvailability(
        tenantId: string,
        time: Date,
        excludeAppointmentId?: string
    ): Promise<boolean> {
        const query = excludeAppointmentId
            ? `
            select id
            from public.appointments
            where tenant_id = $1
              and status = 'booked'
              and scheduled_time = $2
              and id <> $3
            limit 1
        `
            : `
            select id
            from public.appointments
            where tenant_id = $1
              and status = 'booked'
              and scheduled_time = $2
            limit 1
        `;
        const params = excludeAppointmentId
            ? [tenantId, time.toISOString(), excludeAppointmentId]
            : [tenantId, time.toISOString()];
        const local = await voiceDb.query(query, params);
        if (local.rows.length > 0) return false;

        if (!(await googleCalendarService.hasConnection(tenantId))) {
            return true;
        }

        try {
            const googleFree = await Promise.race([
                googleCalendarService.getAvailability(tenantId, time, plusMinutes(time, 60)),
                new Promise<boolean>((resolve) =>
                    setTimeout(() => {
                        logger.warn('APPOINTMENT_GOOGLE_AVAIL_TIMEOUT', { tenantId });
                        resolve(true);
                    }, GOOGLE_AVAIL_TIMEOUT_MS)
                ),
            ]);
            return googleFree;
        } catch (err) {
            logger.warn('APPOINTMENT_GOOGLE_AVAIL_FAILED', {
                tenantId,
                error: String(err),
            });
            return true;
        }
    }

    /**
     * Calendly has no API to create a confirmed booking at a chosen time -- it only
     * issues booking links for the customer to complete themselves. If Calendly is
     * the tenant's only connected scheduler (no Google/Outlook/Acuity for instant
     * booking), text the caller a link instead of pretending to confirm a time.
     * Returns null (caller should fall through to normal booking) when Calendly
     * isn't the right path or anything about it fails.
     */
    private async tryCalendlyOnlyBooking(
        input: AppointmentInput,
        requestedTime: Date
    ): Promise<AppointmentResult | null> {
        try {
            const { outlookCalendarService } = await import('../calendar/outlook.calendar.service.js');
            const { acuityService } = await import('../calendar/acuity.service.js');
            const [hasGoogle, outlookConn, acuityConn] = await Promise.all([
                googleCalendarService.hasConnection(input.tenantId),
                outlookCalendarService.getConnection(input.tenantId),
                acuityService.getConnection(input.tenantId),
            ]);
            if (hasGoogle || outlookConn || acuityConn) return null;

            const { calendlyService } = await import('../calendar/calendly.service.js');
            const calendlyConn = await calendlyService.getConnection(input.tenantId);
            if (!calendlyConn) return null;

            const types = await calendlyService.getEventTypes(input.tenantId);
            const rawId = String(types?.[0]?.uri || types?.[0]?.id || '');
            if (!rawId) return null;
            const eventTypeId = rawId.includes('/') ? rawId.split('/').pop()! : rawId;

            const link = await calendlyService.createInviteLink(
                input.tenantId,
                eventTypeId,
                requestedTime.toISOString()
            );

            const { smsService } = await import('../sms/sms.service.js');
            await smsService
                .sendSms(
                    input.tenantId,
                    input.phone,
                    `Hi ${input.name}, thanks for calling! Pick your preferred time here: ${link}`
                )
                .catch((err) => {
                    logger.warn('APPOINTMENT_CALENDLY_SMS_FAILED', {
                        tenantId: input.tenantId,
                        error: String(err),
                    });
                });

            const { leadsService } = await import('../leads/leads.service.js');
            await leadsService
                .createLead(input.tenantId, input.phone, 'inbound_call', {
                    name: input.name,
                    email: input.email,
                    service: input.service,
                    notes: `Sent Calendly booking link for ${input.service} (requested ${requestedTime.toISOString()}): ${link}`,
                    preferred_time: requestedTime.toISOString(),
                    metadata: { calendlyLinkSent: true, calendlyLink: link },
                })
                .catch((err) => {
                    logger.warn('APPOINTMENT_CALENDLY_LEAD_SYNC_FAILED', {
                        tenantId: input.tenantId,
                        error: String(err),
                    });
                });

            logAppointmentWrite('create', {
                appointmentId: 'calendly-link',
                scheduledTime: requestedTime.toISOString(),
                phone: input.phone,
                calendarSyncResult: 'calendly_link_sent',
            });

            return {
                success: true,
                message:
                    "I've texted you a link to pick your exact time on our calendar — you'll get a confirmation once you book it.",
            };
        } catch (err) {
            logger.warn('APPOINTMENT_CALENDLY_FLOW_FAILED', {
                tenantId: input.tenantId,
                error: String(err),
            });
            return null;
        }
    }

    async createAppointment(input: AppointmentInput): Promise<AppointmentResult> {
        const parsed = parseFutureDate(input.time);
        if (!parsed) {
            return {
                success: false,
                message: 'The requested time is invalid or in the past. Please share a future date and time.',
            };
        }

        const calendlyResult = await this.tryCalendlyOnlyBooking(input, parsed);
        if (calendlyResult) return calendlyResult;

        const available = await this.checkAvailability(input.tenantId, parsed);
        if (!available) {
            const alternative = plusMinutes(parsed, 60);
            return {
                success: false,
                message: `That slot is unavailable. I can offer ${alternative.toISOString()} instead.`,
                alternativeTime: alternative.toISOString(),
            };
        }

        let result;
        try {
            result = await voiceDb.query(
                `insert into public.appointments (tenant_id, name, phone, service, scheduled_time, status, calendar_event_id)
                 values ($1, $2, $3, $4, $5, 'booked', null)
                 returning id, scheduled_time`,
                [
                    input.tenantId,
                    input.name,
                    input.phone,
                    input.service,
                    parsed.toISOString(),
                ]
            );
        } catch (dbErr) {
            logger.error('APPOINTMENT_INSERT_FAILED', {
                tenantId: input.tenantId,
                error: String(dbErr),
            });
            return {
                success: false,
                message: 'Could not save the appointment. Please try again or contact support.',
            };
        }

        const scheduledTime = new Date(result.rows[0].scheduled_time).toISOString();
        const appointmentId = result.rows[0].id as string;

        void import('./appointment-external-sync.service.js').then(({ syncAppointmentToExternalCalendars }) => {
            syncAppointmentToExternalCalendars({
                tenantId: input.tenantId,
                appointmentId,
                name: input.name,
                phone: input.phone,
                email: input.email,
                service: input.service,
                start: parsed,
                end: plusMinutes(parsed, 60),
            }).catch((err) => {
                logger.warn('APPOINTMENT_EXTERNAL_CALENDAR_SYNC_FAILED', {
                    tenantId: input.tenantId,
                    appointmentId,
                    error: String(err),
                });
            });
        });

        try {
            await syncLeadAfterBooking(
                input.tenantId,
                input.phone,
                input.name,
                input.service,
                scheduledTime,
                appointmentId,
                input.email
            );
        } catch (leadErr) {
            logger.warn('APPOINTMENT_LEAD_SYNC_FAILED', {
                tenantId: input.tenantId,
                appointmentId,
                error: String(leadErr),
            });
        }

        patchCorrelation({ tenantId: input.tenantId });
        logAppointmentWrite('create', {
            appointmentId,
            scheduledTime,
            phone: input.phone,
            calendarSyncResult: 'external_sync_queued',
        });

        void import('../../events/event-publisher.js')
            .then(async ({ publishPlatformEvent }) => {
                const { PlatformEventTypes } = await import('../../events/event-types.js');
                publishPlatformEvent(
                    PlatformEventTypes.APPOINTMENT_CREATED,
                    { appointmentId, scheduledTime, phone: input.phone },
                    { tenantId: input.tenantId }
                );
            })
            .catch(() => {});

        void import('../dashboard/dashboard-events.js').then(({ publishDashboardPushType }) => {
            publishDashboardPushType(input.tenantId, 'calendar.updated', [], { appointmentId });
        });

        void import('../integrations/integration.service.js').then(({ integrationService }) => {
            const crmCallId = input.callSid?.trim() || appointmentId;
            integrationService
                .sendRealtime(input.tenantId, {
                    callId: crmCallId,
                    type: 'appointment',
                    lead: {
                        name: input.name,
                        phone: input.phone,
                        service: input.service,
                        preferred_time: scheduledTime,
                        notes: `Appointment booked via Halla AI for ${scheduledTime}`,
                    },
                    appointment: {
                        name: input.name,
                        phone: input.phone,
                        service: input.service,
                        time: scheduledTime,
                    },
                })
                .catch(() => {});
        });

        void import('../slack/slack.service.js').then(({ slackService }) => {
            slackService
                .sendAppointmentBookedNotification(input.tenantId, {
                    customerName: input.name,
                    customerPhone: input.phone,
                    service: input.service || 'Appointment',
                    appointmentTime: new Date(scheduledTime),
                })
                .catch(() => {});
        });

        invalidateTenantAvailabilityCache(input.tenantId);

        return {
            success: true,
            message: `You are booked for ${new Date(scheduledTime).toLocaleString()}.`,
            appointmentId,
            scheduledTime,
        };
    }

    async rescheduleAppointment(
        tenantId: string,
        newTime: string,
        lookup: RescheduleLookup
    ): Promise<AppointmentResult> {
        const parsed = parseAppointmentTime(newTime);
        if (!parsed) {
            return {
                success: false,
                message: 'The new time is invalid or in the past. Please share a future date and time.',
            };
        }

        const appointmentId = lookup.appointmentId?.trim();
        const phone = lookup.phone?.trim();

        if (!appointmentId && !phone) {
            return {
                success: false,
                message: 'I need an appointment id or the phone number on the booking to reschedule.',
            };
        }

        let existing;
        if (appointmentId) {
            existing = await voiceDb.query(
                `select id, name, phone, service, calendar_event_id, calendar_provider, external_calendar_event_id
                 from public.appointments
                 where id = $1 and tenant_id = $2 and status = 'booked'`,
                [appointmentId, tenantId]
            );
        } else {
            existing = await voiceDb.query(
                `select id, name, phone, service, calendar_event_id, calendar_provider, external_calendar_event_id
                 from public.appointments
                 where tenant_id = $1
                   and phone = $2
                   and status = 'booked'
                 order by scheduled_time desc
                 limit 1`,
                [tenantId, phone!]
            );
        }

        if (!existing.rows.length) {
            return {
                success: false,
                message: appointmentId
                    ? 'I could not find that appointment.'
                    : 'I could not find an existing booked appointment for this phone number.',
            };
        }

        const appointment = existing.rows[0];
        const available = await this.checkAvailability(tenantId, parsed, appointment.id as string);
        if (!available) {
            const alternative = plusMinutes(parsed, 60);
            return {
                success: false,
                message: `That new slot is unavailable. I can offer ${alternative.toISOString()} instead.`,
                alternativeTime: alternative.toISOString(),
            };
        }

        await voiceDb.query(
            `update public.appointments
             set scheduled_time = $1
             where id = $2 and tenant_id = $3`,
            [parsed.toISOString(), appointment.id, tenantId]
        );

        try {
            if (appointment.calendar_provider === 'google' && appointment.calendar_event_id) {
                await googleCalendarService.updateEvent(
                    tenantId,
                    appointment.calendar_event_id,
                    parsed,
                    plusMinutes(parsed, 60)
                );
            } else if (appointment.calendar_provider === 'outlook' && appointment.external_calendar_event_id) {
                const { outlookCalendarService } = await import('../calendar/outlook.calendar.service.js');
                await outlookCalendarService.updateEvent(
                    tenantId,
                    appointment.external_calendar_event_id as string,
                    parsed,
                    plusMinutes(parsed, 60)
                );
            } else if (appointment.calendar_provider === 'acuity' && appointment.external_calendar_event_id) {
                // Acuity has no reschedule endpoint — cancel and rebook at the new time.
                const { acuityService } = await import('../calendar/acuity.service.js');
                await acuityService.cancelAppointment(tenantId, appointment.external_calendar_event_id as string);
                const types = await acuityService.getAppointmentTypes(tenantId);
                const typeId = String(types?.[0]?.id || '');
                if (typeId) {
                    const rebooked = await acuityService.createAppointment(
                        tenantId,
                        typeId,
                        parsed.toISOString(),
                        String(appointment.name || ''),
                        '',
                        String(appointment.phone || '')
                    );
                    if (rebooked?.id) {
                        await voiceDb.query(
                            `UPDATE public.appointments SET external_calendar_event_id = $1 WHERE id = $2 AND tenant_id = $3`,
                            [String(rebooked.id), appointment.id, tenantId]
                        );
                    }
                }
            }
        } catch (syncErr) {
            logger.warn('APPOINTMENT_EXTERNAL_RESCHEDULE_FAILED', {
                tenantId,
                provider: appointment.calendar_provider,
                error: String(syncErr),
            });
        }

        try {
            const { leadsService } = await import('../leads/leads.service.js');
            const leadPhone = String(appointment.phone || phone || '');
            if (leadPhone) {
                const lead = await leadsService.createLead(tenantId, leadPhone, 'inbound_call', {
                    name: String(appointment.name || ''),
                    service: String(appointment.service || ''),
                    notes: `Appointment rescheduled to ${parsed.toISOString()}`,
                    preferred_time: parsed.toISOString(),
                    metadata: { appointmentId: appointment.id, rescheduled: true },
                });
                await leadsService.updateLeadStatus(tenantId, lead.id, 'appointment_set').catch(() => {});
            }
        } catch (leadErr) {
            logger.warn('APPOINTMENT_RESCHEDULE_LEAD_SYNC_FAILED', {
                tenantId,
                error: String(leadErr),
            });
        }

        patchCorrelation({ tenantId });
        logAppointmentWrite('reschedule', {
            appointmentId: appointment.id as string,
            scheduledTime: parsed.toISOString(),
            phone: appointment.phone,
            calendarSyncResult: appointment.calendar_provider ? `${appointment.calendar_provider}_attempted` : 'local_only',
        });

        void import('../../events/event-publisher.js')
            .then(async ({ publishPlatformEvent }) => {
                const { PlatformEventTypes } = await import('../../events/event-types.js');
                publishPlatformEvent(
                    PlatformEventTypes.APPOINTMENT_RESCHEDULED,
                    {
                        appointmentId: appointment.id,
                        scheduledTime: parsed.toISOString(),
                    },
                    { tenantId }
                );
            })
            .catch(() => {});

        void import('../dashboard/dashboard-events.js').then(({ publishDashboardPushType }) => {
            publishDashboardPushType(tenantId, 'calendar.updated', [], {
                appointmentId: appointment.id as string,
            });
        });

        invalidateTenantAvailabilityCache(tenantId);

        return {
            success: true,
            message: `I have moved your appointment to ${parsed.toLocaleString()}.`,
            appointmentId: appointment.id as string,
            scheduledTime: parsed.toISOString(),
        };
    }

    async cancelAppointment(
        tenantId: string,
        appointmentId: string,
        reason?: string
    ): Promise<AppointmentResult> {
        const existing = await voiceDb.query(
            `select id, calendar_event_id, calendar_provider, external_calendar_event_id
             from public.appointments
             where id = $1 and tenant_id = $2 and status = 'booked'`,
            [appointmentId, tenantId]
        );
        if (!existing.rows.length) {
            return { success: false, message: 'Appointment not found or already cancelled.' };
        }
        const row = existing.rows[0];

        await voiceDb.query(
            `update public.appointments set status = 'cancelled' where id = $1 and tenant_id = $2`,
            [appointmentId, tenantId]
        );

        try {
            if (row.calendar_provider === 'google' && row.calendar_event_id) {
                await calendarService.cancelEvent(tenantId, appointmentId);
            } else if (row.calendar_provider === 'outlook' && row.external_calendar_event_id) {
                const { outlookCalendarService } = await import('../calendar/outlook.calendar.service.js');
                await outlookCalendarService.cancelEvent(tenantId, row.external_calendar_event_id as string);
            } else if (row.calendar_provider === 'acuity' && row.external_calendar_event_id) {
                const { acuityService } = await import('../calendar/acuity.service.js');
                await acuityService.cancelAppointment(tenantId, row.external_calendar_event_id as string);
            }
        } catch (err) {
            logger.warn('APPOINTMENT_EXTERNAL_CANCEL_FAILED', {
                tenantId,
                appointmentId,
                provider: row.calendar_provider,
                error: String(err),
            });
        }

        patchCorrelation({ tenantId });
        logAppointmentWrite('cancel', { appointmentId });

        void import('../../events/event-publisher.js')
            .then(async ({ publishPlatformEvent }) => {
                const { PlatformEventTypes } = await import('../../events/event-types.js');
                publishPlatformEvent(
                    PlatformEventTypes.APPOINTMENT_CANCELLED,
                    { appointmentId, reason },
                    { tenantId }
                );
            })
            .catch(() => {});

        void import('../dashboard/dashboard-events.js').then(({ publishDashboardPushType }) => {
            publishDashboardPushType(tenantId, 'calendar.updated', [], { appointmentId });
        });

        invalidateTenantAvailabilityCache(tenantId);

        return { success: true, message: 'Appointment cancelled.', appointmentId };
    }
}

export const appointmentService = new AppointmentService();

/** Tomorrow 10:00 local — fallback when the agent booked without an ISO time. */
export function defaultNextAppointmentSlot(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
}

export function resolveAppointmentTimeInput(raw?: string | null): string | null {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed || trimmed.toLowerCase() === 'booked') return null;
    if (!parseAppointmentTime(trimmed)) return null;
    return trimmed;
}

export interface CallBookingContext {
    lead: {
        id: string;
        name: string | null;
        phone: string | null;
        service: string | null;
        preferred_time: string | null;
        status: string | null;
    } | null;
    appointment: {
        id: string;
        name: string;
        phone: string;
        service: string;
        scheduled_time: string;
        status: string;
    } | null;
    canCreateFromCall: boolean;
}

export async function getBookingForCall(
    tenantId: string,
    callId: string
): Promise<CallBookingContext> {
    const leadResult = await voiceDb.query(
        `select id, name, phone, service, preferred_time, status
         from public.leads
         where tenant_id = $1 and call_id = $2
         order by created_at desc
         limit 1`,
        [tenantId, callId]
    );
    const lead = leadResult.rows[0] as CallBookingContext['lead'] | undefined;

    let appointment: CallBookingContext['appointment'] = null;
    const phone = lead?.phone?.trim();
    if (phone) {
        const aptResult = await voiceDb.query(
            `select id, name, phone, service, scheduled_time, status
             from public.appointments
             where tenant_id = $1 and phone = $2 and status = 'booked'
             order by scheduled_time desc
             limit 1`,
            [tenantId, phone]
        );
        appointment = (aptResult.rows[0] as CallBookingContext['appointment']) || null;
    }

    return {
        lead: lead ?? null,
        appointment,
        canCreateFromCall: Boolean(lead) && !appointment,
    };
}

export async function createAppointmentFromCall(
    tenantId: string,
    callId: string,
    input?: { scheduled_time?: string }
): Promise<AppointmentResult> {
    const ctx = await getBookingForCall(tenantId, callId);
    if (ctx.appointment) {
        return {
            success: true,
            message: 'Appointment already exists for this call.',
            appointmentId: ctx.appointment.id,
            scheduledTime: ctx.appointment.scheduled_time,
        };
    }
    if (!ctx.lead) {
        return { success: false, message: 'No lead linked to this call yet.' };
    }

    let callSid: string | undefined;
    try {
        const row = await voiceDb.query(
            `select call_sid from public.calls where id = $1 and tenant_id = $2 limit 1`,
            [callId, tenantId]
        );
        callSid = row.rows[0]?.call_sid as string | undefined;
    } catch {
        /* optional */
    }

    const time =
        resolveAppointmentTimeInput(input?.scheduled_time) ||
        resolveAppointmentTimeInput(ctx.lead.preferred_time) ||
        defaultNextAppointmentSlot();

    return appointmentService.createAppointment({
        tenantId,
        name: ctx.lead.name?.trim() || 'Caller',
        phone: ctx.lead.phone?.trim() || 'unknown',
        service: ctx.lead.service?.trim() || 'Appointment',
        time,
        callSid,
    });
}

/** After a call when booking was discussed but the tool may not have run. */
export async function backfillAppointmentFromCall(
    tenantId: string,
    input: {
        name?: string;
        phone?: string;
        service?: string;
        preferredTime?: string;
        useDefaultTimeIfInvalid?: boolean;
        callSid?: string;
    }
): Promise<AppointmentResult | null> {
    let time = resolveAppointmentTimeInput(input.preferredTime);
    if (!time && input.useDefaultTimeIfInvalid) {
        time = defaultNextAppointmentSlot();
    }
    if (!time) return null;
    const phone = (input.phone || '').trim() || 'unknown';
    const name = (input.name || '').trim() || 'Caller';
    return appointmentService.createAppointment({
        tenantId,
        name,
        phone,
        service: input.service?.trim() || 'Appointment',
        time,
        callSid: input.callSid,
    });
}
