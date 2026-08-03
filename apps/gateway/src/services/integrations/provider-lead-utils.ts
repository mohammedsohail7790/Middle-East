import type { IntegrationPayload } from './integration.service.js';

/** Ensure CRM providers receive scheduled time and contact fields from appointment payloads. */
export function normalizeIntegrationPayload(payload: IntegrationPayload): IntegrationPayload {
    const lead = { ...payload.lead };
    const appointment = payload.appointment ? { ...payload.appointment } : undefined;
    const scheduledTime = appointment?.time?.trim() || lead.preferred_time?.trim();

    if (scheduledTime && !lead.preferred_time) {
        lead.preferred_time = scheduledTime;
    }

    if (appointment?.name && !lead.name) lead.name = appointment.name;
    if (appointment?.phone && !lead.phone) lead.phone = appointment.phone;
    if (appointment?.service && !lead.service) lead.service = appointment.service;

    const type =
        payload.type ||
        (scheduledTime && (payload.appointment || lead.preferred_time) ? 'appointment' : 'lead');

    return {
        ...payload,
        type,
        lead,
        appointment: appointment || (scheduledTime
            ? {
                  name: lead.name,
                  phone: lead.phone,
                  service: lead.service,
                  time: scheduledTime,
              }
            : undefined),
    };
}

export function splitLeadName(fullName?: string): { first: string; last: string } {
    const parts = (fullName || 'Customer').trim().split(/\s+/);
    return { first: parts[0] || 'Customer', last: parts.slice(1).join(' ') || 'Call' };
}

export function leadNotes(payload: IntegrationPayload): string {
    const { lead } = payload;
    const lines = [
        lead.notes,
        lead.service ? `Service: ${lead.service}` : null,
        lead.preferred_time ? `Preferred time: ${lead.preferred_time}` : null,
        `Call IQ reference: ${payload.callId}`,
    ].filter(Boolean);
    return lines.join('\n');
}
