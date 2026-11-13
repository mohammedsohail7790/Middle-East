import { voiceDb } from '../voice/tenant-scope.js';
import { googleCalendarService } from '../calendar/google.calendar.service.js';
import { calendarService } from '../calendar/calendar.service.js';
import { logger } from '../logger.js';
import { logAppointmentWrite } from '../observability/validation-telemetry.js';
import { patchCorrelation } from '../observability/correlation-context.js';
import { invalidateTenantAvailabilityCache, calendlyOwnsScheduling } from './tenant-availability.service.js';
import { getTenantTimezone } from './tenant-timezone.js';
import { resolveAppointmentCorrelation } from '../klaros/correlation.js';

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
     * Text the caller a Calendly link to pick their own time. This is the
     * fallback whenever the Scheduling API can't be used (no email on the call,
     * plan without API access, API failure). It never claims a booking: if the
     * SMS itself can't be sent the caller is told so.
     */
    private async sendCalendlyLinkFallback(
        input: AppointmentInput,
        requestedTime: Date,
        eventTypeUri: string,
        reason: string
    ): Promise<AppointmentResult | null> {
        try {
            const { calendlyService } = await import('../calendar/calendly.service.js');
            const eventTypeId = eventTypeUri.includes('/') ? eventTypeUri.split('/').pop()! : eventTypeUri;
            const link = await calendlyService.createInviteLink(
                input.tenantId,
                eventTypeId,
                requestedTime.toISOString()
            );

            const { smsService } = await import('../sms/sms.service.js');
            let smsSent = true;
            await smsService
                .sendSms(
                    input.tenantId,
                    input.phone,
                    `Hi ${input.name}, thanks for calling! Pick your preferred time here: ${link}`
                )
                .catch((err) => {
                    smsSent = false;
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
                    notes: `Calendly booking link ${smsSent ? 'sent' : 'NOT delivered, follow up'} for ${input.service} (requested ${requestedTime.toISOString()}): ${link}`,
                    preferred_time: requestedTime.toISOString(),
                    metadata: { calendlyLinkSent: smsSent, calendlyLink: link, calendlyFallbackReason: reason },
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
                calendarSyncResult: smsSent ? 'calendly_link_sent' : 'calendly_link_sms_failed',
            });

            if (!smsSent) {
                return {
                    success: false,
                    message:
                        "I couldn't send the booking link just now, and your time is not booked yet. Our team will follow up to confirm it.",
                };
            }
            return {
                success: true,
                message:
                    "I couldn't confirm that time directly, so I've texted you a link to pick your exact time. It isn't booked until you choose a time there.",
            };
        } catch (err) {
            logger.warn('APPOINTMENT_CALENDLY_LINK_FALLBACK_FAILED', {
                tenantId: input.tenantId,
                error: String(err),
            });
            return null;
        }
    }

    /**
     * Is `time` one of the start times Calendly reports as open? Returns the
     * matching event type, or the nearest later open time as an alternative.
     * Throws when Calendly can't answer (callers fall back, never assume free).
     */
    private async verifyCalendlySlot(
        tenantId: string,
        time: Date
    ): Promise<
        | { status: 'free'; eventType: import('../calendar/calendly.service.js').CalendlySchedulingEventType }
        | { status: 'busy'; alternative?: Date }
        | { status: 'unknown' }
    > {
        const { calendlyService } = await import('../calendar/calendly.service.js');
        const eventType = await calendlyService.getSchedulingEventType(tenantId);
        if (!eventType) return { status: 'unknown' };
        const slots = await calendlyService.getAvailableTimes(
            tenantId,
            eventType,
            time,
            new Date(time.getTime() + 24 * 60 * 60 * 1000)
        );
        if (slots.some((s) => Math.abs(s.start.getTime() - time.getTime()) < 60_000)) {
            return { status: 'free', eventType };
        }
        const later = slots.find((s) => s.start.getTime() > time.getTime());
        return { status: 'busy', alternative: later?.start };
    }

    /**
     * Calendly as the tenant's only scheduler: check Calendly's real availability
     * and create the booking through its Scheduling API so it appears in
     * Calendly. When that can't be done (no caller email, no API access, API
     * error) text the caller the booking link instead. Returns null only when
     * Calendly isn't the right path, so normal booking continues.
     */
    private async tryCalendlyBooking(
        input: AppointmentInput,
        requestedTime: Date
    ): Promise<
        | { kind: 'result'; result: AppointmentResult }
        | { kind: 'booked'; eventUri: string }
        | null
    > {
        try {
            if (!(await calendlyOwnsScheduling(input.tenantId))) return null;
            const { calendlyService, CalendlyApiError } = await import('../calendar/calendly.service.js');

            let eventType;
            try {
                const check = await this.verifyCalendlySlot(input.tenantId, requestedTime);
                if (check.status === 'unknown') return null;
                if (check.status === 'busy') {
                    return {
                        kind: 'result',
                        result: check.alternative
                            ? {
                                  success: false,
                                  message: `That time isn't open. The next open time is ${check.alternative.toISOString()}.`,
                                  alternativeTime: check.alternative.toISOString(),
                              }
                            : {
                                  success: false,
                                  message: "That time isn't open and I don't see another opening that day. Please suggest a different day.",
                              },
                    };
                }
                eventType = check.eventType;
            } catch (err) {
                logger.warn('APPOINTMENT_CALENDLY_AVAILABILITY_FAILED', {
                    tenantId: input.tenantId,
                    status: err instanceof CalendlyApiError ? err.status : undefined,
                    error: String(err),
                });
                const types = await calendlyService.getEventTypes(input.tenantId).catch(() => []);
                const uri = String(types?.[0]?.uri || '');
                if (!uri) return null;
                const fb = await this.sendCalendlyLinkFallback(input, requestedTime, uri, 'availability_failed');
                return fb ? { kind: 'result', result: fb } : null;
            }

            const email = input.email?.trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                const fb = await this.sendCalendlyLinkFallback(input, requestedTime, eventType.uri, 'no_email');
                return fb ? { kind: 'result', result: fb } : null;
            }

            try {
                const booking = await calendlyService.createBooking(input.tenantId, {
                    eventType,
                    start: requestedTime,
                    name: input.name,
                    email,
                    phone: input.phone,
                    timezone: await getTenantTimezone(input.tenantId),
                });
                return { kind: 'booked', eventUri: booking.eventUri };
            } catch (err) {
                if (err instanceof CalendlyApiError && err.isSlotUnavailable) {
                    invalidateTenantAvailabilityCache(input.tenantId);
                    return {
                        kind: 'result',
                        result: { success: false, message: 'That time was just taken. Please choose another time.' },
                    };
                }
                logger.warn('APPOINTMENT_CALENDLY_BOOKING_FAILED', {
                    tenantId: input.tenantId,
                    status: err instanceof CalendlyApiError ? err.status : undefined,
                    accessDenied: err instanceof CalendlyApiError ? err.isAccessDenied : false,
                    error: String(err),
                });
                const fb = await this.sendCalendlyLinkFallback(input, requestedTime, eventType.uri, 'booking_failed');
                return fb ? { kind: 'result', result: fb } : null;
            }
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

        const calendly = await this.tryCalendlyBooking(input, parsed);
        if (calendly?.kind === 'result') return calendly.result;
        const calendlyEventUri = calendly?.kind === 'booked' ? calendly.eventUri : null;

        // Calendly already verified the slot against its own availability.
        const available = calendlyEventUri ? true : await this.checkAvailability(input.tenantId, parsed);
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
                `insert into public.appointments (tenant_id, name, phone, service, scheduled_time, status, calendar_event_id, calendar_provider, external_calendar_event_id)
                 values ($1, $2, $3, $4, $5, 'booked', null, $6, $7)
                 returning id, scheduled_time`,
                [
                    input.tenantId,
                    input.name,
                    input.phone,
                    input.service,
                    parsed.toISOString(),
                    calendlyEventUri ? 'calendly' : null,
                    calendlyEventUri,
                ]
            );
        } catch (dbErr) {
            logger.error('APPOINTMENT_INSERT_FAILED', {
                tenantId: input.tenantId,
                error: String(dbErr),
                calendlyBooked: !!calendlyEventUri,
            });
            if (calendlyEventUri) {
                // The booking exists in Calendly; only our local record failed.
                invalidateTenantAvailabilityCache(input.tenantId);
                return {
                    success: true,
                    message: `You are booked for ${parsed.toLocaleString()}.`,
                    scheduledTime: parsed.toISOString(),
                };
            }
            return {
                success: false,
                message: 'Could not save the appointment. Please try again or contact support.',
            };
        }

        const scheduledTime = new Date(result.rows[0].scheduled_time).toISOString();
        const appointmentId = result.rows[0].id as string;

        if (!calendlyEventUri) void import('./appointment-external-sync.service.js').then(({ syncAppointmentToExternalCalendars }) => {
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
                const correlation = await resolveAppointmentCorrelation(input.tenantId, appointmentId);
                publishPlatformEvent(
                    PlatformEventTypes.APPOINTMENT_CREATED,
                    { appointmentId, scheduledTime, phone: input.phone, ...correlation },
                    { tenantId: input.tenantId }
                );
            })
            .catch(() => {});

        // Start the business's switched-on automations for a new appointment (guarded: can never break booking).
        void import('../automation-engine/triggers.js').then((m) => m.emitAutomationTrigger(input.tenantId, 'appointment.created', appointmentId, { name: input.name, phone: input.phone, email: input.email, service: input.service, scheduledTime, createdAt: new Date().toISOString() })).catch(() => {});

        void import('../dashboard/dashboard-events.js')
            .then(({ publishDashboardPushType }) => {
                publishDashboardPushType(input.tenantId, 'calendar.updated', [], { appointmentId });
            })
            .catch(() => {});

        void import('../integrations/integration.service.js')
            .then(({ integrationService }) => {
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
            })
            .catch(() => {});

        void import('../slack/slack.service.js')
            .then(({ slackService }) => {
                slackService
                    .sendAppointmentBookedNotification(input.tenantId, {
                        customerName: input.name,
                        customerPhone: input.phone,
                        service: input.service || 'Appointment',
                        appointmentTime: new Date(scheduledTime),
                    })
                    .catch(() => {});
            })
            .catch(() => {});

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
        const isCalendly =
            appointment.calendar_provider === 'calendly' && !!appointment.external_calendar_event_id;
        let newCalendlyEventUri: string | null = null;
        if (isCalendly) {
            const moved = await this.rescheduleCalendlyBooking(
                tenantId,
                String(appointment.external_calendar_event_id),
                parsed,
                String(appointment.name || ''),
                String(appointment.phone || phone || '')
            );
            if ('result' in moved) return moved.result;
            newCalendlyEventUri = moved.eventUri;
        }
        const available = isCalendly
            ? true
            : await this.checkAvailability(tenantId, parsed, appointment.id as string);
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
        if (newCalendlyEventUri) {
            await voiceDb.query(
                `update public.appointments set external_calendar_event_id = $1 where id = $2 and tenant_id = $3`,
                [newCalendlyEventUri, appointment.id, tenantId]
            );
        }

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
                const correlation = await resolveAppointmentCorrelation(tenantId, appointment.id as string);
                publishPlatformEvent(
                    PlatformEventTypes.APPOINTMENT_RESCHEDULED,
                    {
                        appointmentId: appointment.id,
                        scheduledTime: parsed.toISOString(),
                        ...correlation,
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

    /**
     * Calendly has no reschedule endpoint: book the new time first, then cancel
     * the old event, and roll the new one back if that cancel fails. Any failure
     * leaves the original booking untouched and is reported honestly.
     */
    private async rescheduleCalendlyBooking(
        tenantId: string,
        oldEventUri: string,
        newTime: Date,
        fallbackName: string,
        phone: string
    ): Promise<{ eventUri: string } | { result: AppointmentResult }> {
        const unchanged = (message: string): { result: AppointmentResult } => ({
            result: { success: false, message },
        });
        try {
            const { calendlyService } = await import('../calendar/calendly.service.js');
            const check = await this.verifyCalendlySlot(tenantId, newTime);
            if (check.status === 'unknown') {
                return unchanged("I couldn't reach the calendar to move your appointment, so it hasn't changed. Our team will follow up.");
            }
            if (check.status === 'busy') {
                return {
                    result: {
                        success: false,
                        message: check.alternative
                            ? `That new slot is unavailable. I can offer ${check.alternative.toISOString()} instead.`
                            : "That new time isn't open. Please suggest another day.",
                        alternativeTime: check.alternative?.toISOString(),
                    },
                };
            }
            const invitee = await calendlyService.getEventInvitee(tenantId, oldEventUri);
            const booking = await calendlyService.createBooking(tenantId, {
                eventType: check.eventType,
                start: newTime,
                name: invitee.name || fallbackName || 'Caller',
                email: invitee.email,
                phone,
                timezone: await getTenantTimezone(tenantId),
            });
            try {
                await calendlyService.cancelScheduledEvent(tenantId, oldEventUri, 'Rescheduled via Halla AI');
            } catch (cancelErr) {
                logger.error('APPOINTMENT_CALENDLY_RESCHEDULE_OLD_CANCEL_FAILED', {
                    tenantId,
                    error: String(cancelErr),
                });
                await calendlyService
                    .cancelScheduledEvent(tenantId, booking.eventUri, 'Rolled back failed reschedule')
                    .catch((rollbackErr) =>
                        logger.error('APPOINTMENT_CALENDLY_RESCHEDULE_ROLLBACK_FAILED', {
                            tenantId,
                            error: String(rollbackErr),
                        })
                    );
                return unchanged("I couldn't move your appointment on the calendar, so it hasn't changed. Our team will follow up.");
            }
            return { eventUri: booking.eventUri };
        } catch (err) {
            const { CalendlyApiError } = await import('../calendar/calendly.service.js');
            if (err instanceof CalendlyApiError && err.isSlotUnavailable) {
                return unchanged('That new time was just taken. Please choose another time.');
            }
            logger.warn('APPOINTMENT_CALENDLY_RESCHEDULE_FAILED', { tenantId, error: String(err) });
            return unchanged("I couldn't move your appointment on the calendar, so it hasn't changed. Our team will follow up.");
        }
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

        if (row.calendar_provider === 'calendly' && row.external_calendar_event_id) {
            // Cancel in Calendly first: if it fails the booking still exists there,
            // so never tell the caller it is cancelled.
            try {
                const { calendlyService } = await import('../calendar/calendly.service.js');
                await calendlyService.cancelScheduledEvent(
                    tenantId,
                    row.external_calendar_event_id as string,
                    reason
                );
            } catch (err) {
                logger.warn('APPOINTMENT_CALENDLY_CANCEL_FAILED', {
                    tenantId,
                    appointmentId,
                    error: String(err),
                });
                return {
                    success: false,
                    message:
                        "I couldn't cancel that on the calendar just now, so it's still booked. Our team will follow up to cancel it.",
                    appointmentId,
                };
            }
        }

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
                const correlation = await resolveAppointmentCorrelation(tenantId, appointmentId);
                publishPlatformEvent(
                    PlatformEventTypes.APPOINTMENT_CANCELLED,
                    { appointmentId, reason, ...correlation },
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
