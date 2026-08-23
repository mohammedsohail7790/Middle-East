import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';

export interface HubSpotConfig {
    apiKey: string;
    portalId: string;
}

/**
 * HubSpot Integration Provider
 * Docs: https://developers.hubspot.com/docs/api/overview
 *
 * Fixes:
 *  - hs_note is not a valid deal property; notes are now created as Note engagements
 *    and associated to both the contact and the deal.
 *  - Duplicate contact prevention via search-before-create.
 */
export class HubSpotProvider {
    private baseUrl = 'https://api.hubapi.com';

    async sendLead(config: HubSpotConfig, payload: IntegrationPayload): Promise<void> {
        const { lead } = payload;

        // Step 1: Find or create contact (prevents duplicates on repeat callers)
        const { contactId, isNew } = await this.findOrCreateContact(config, {
            firstName: this.parseFirstName(lead.name),
            lastName: this.parseLastName(lead.name),
            phone: lead.phone || '',
            email: lead.notes?.includes('@') ? lead.notes : undefined,
        });

        // Step 2: Create deal
        const dealId = await this.createDeal(config, {
            contactId,
            dealName: `${lead.service || 'Service Request'} - ${lead.name || 'Customer'}`,
            dealStage: 'appointmentscheduled',
        });

        // Step 3: Attach notes as a Note engagement (hs_note is not a valid deal property)
        const noteBody = [
            `Service: ${lead.service || 'Not specified'}`,
            `Preferred Time: ${lead.preferred_time || 'ASAP'}`,
            `Notes: ${lead.notes || 'None'}`,
            `Source: Call IQ Voice AI`,
            `Call ID: ${payload.callId}`,
        ].join('\n');

        await this.createNoteEngagement(config, noteBody, contactId, dealId);

        const meetingTime = lead.preferred_time || payload.appointment?.time;
        if (meetingTime && (payload.type === 'appointment' || payload.appointment?.time)) {
            await this.createMeetingEngagement(config, {
                title: `${lead.service || 'Service'} — ${lead.name || 'Customer'}`,
                body: noteBody,
                startTime: meetingTime,
                contactId,
                dealId,
            });
        }

        logger.info('HubSpot lead delivered', {
            callId: payload.callId,
            contactId,
            dealId,
            isNewContact: isNew,
            service: lead.service,
        });
    }

    /**
     * Search for existing contact by phone/email before creating.
     * Returns the contact ID and whether it was newly created.
     */
    private async findOrCreateContact(
        config: HubSpotConfig,
        contact: { firstName: string; lastName: string; phone: string; email?: string }
    ): Promise<{ contactId: string; isNew: boolean }> {
        // Search by phone first
        if (contact.phone) {
            const existing = await this.searchContactByPhone(config, contact.phone);
            if (existing) {
                return { contactId: existing, isNew: false };
            }
        }

        // Search by email if available
        if (contact.email) {
            const existing = await this.searchContactByEmail(config, contact.email);
            if (existing) {
                return { contactId: existing, isNew: false };
            }
        }

        // Create new contact
        const contactId = await this.createContact(config, contact);
        return { contactId, isNew: true };
    }

    private async searchContactByPhone(config: HubSpotConfig, phone: string): Promise<string | null> {
        const normalizedPhone = phone.replace(/[^\d+]/g, '');
        try {
            const response = await fetch(`${this.baseUrl}/crm/v3/objects/contacts/search`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filterGroups: [
                        {
                            filters: [
                                { propertyName: 'phone', operator: 'EQ', value: normalizedPhone },
                            ],
                        },
                    ],
                    properties: ['id'],
                    limit: 1,
                }),
            });
            if (!response.ok) return null;
            const data = (await response.json()) as { results: Array<{ id: string }> };
            return data.results?.[0]?.id ?? null;
        } catch {
            return null;
        }
    }

    private async searchContactByEmail(config: HubSpotConfig, email: string): Promise<string | null> {
        try {
            const response = await fetch(
                `${this.baseUrl}/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
                {
                    headers: { Authorization: `Bearer ${config.apiKey}` },
                }
            );
            if (!response.ok) return null;
            const data = (await response.json()) as { id: string };
            return data.id ?? null;
        } catch {
            return null;
        }
    }

    private async createContact(
        config: HubSpotConfig,
        contact: { firstName: string; lastName: string; phone: string; email?: string }
    ): Promise<string> {
        const properties: Record<string, string> = {
            firstname: contact.firstName,
            lastname: contact.lastName,
            phone: contact.phone,
        };

        if (contact.email) {
            properties.email = contact.email;
        }

        const response = await fetch(`${this.baseUrl}/crm/v3/objects/contacts`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ properties }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HubSpot contact creation failed (${response.status}): ${error}`);
        }

        const result = (await response.json()) as { id: string };
        return result.id;
    }

    private async createDeal(
        config: HubSpotConfig,
        deal: { contactId: string; dealName: string; dealStage: string }
    ): Promise<string> {
        const properties = {
            dealname: deal.dealName,
            dealstage: deal.dealStage,
            pipeline: 'default',
        };

        const response = await fetch(`${this.baseUrl}/crm/v3/objects/deals`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                properties,
                associations: [
                    {
                        to: { id: deal.contactId },
                        types: [
                            {
                                associationCategory: 'HUBSPOT_DEFINED',
                                associationTypeId: 3, // Deal to Contact
                            },
                        ],
                    },
                ],
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HubSpot deal creation failed (${response.status}): ${error}`);
        }

        const result = (await response.json()) as { id: string };
        return result.id;
    }

    /**
     * Create a Note engagement associated with both the contact and deal.
     * This is the correct HubSpot way to attach notes — hs_note is not a valid deal property.
     */
    private async createMeetingEngagement(
        config: HubSpotConfig,
        meeting: {
            title: string;
            body: string;
            startTime: string;
            contactId: string;
            dealId: string;
        }
    ): Promise<void> {
        const start = new Date(meeting.startTime);
        if (Number.isNaN(start.getTime())) return;
        const end = new Date(start.getTime() + 60 * 60 * 1000);

        const response = await fetch(`${this.baseUrl}/crm/v3/objects/meetings`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                properties: {
                    hs_meeting_title: meeting.title,
                    hs_meeting_body: meeting.body,
                    hs_meeting_start_time: start.toISOString(),
                    hs_meeting_end_time: end.toISOString(),
                    hs_timestamp: start.toISOString(),
                },
                associations: [
                    {
                        to: { id: meeting.contactId },
                        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 200 }], // Meeting to Contact
                    },
                    {
                        to: { id: meeting.dealId },
                        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 212 }], // Meeting to Deal
                    },
                ],
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            logger.warn('HubSpot meeting creation failed', {
                contactId: meeting.contactId,
                dealId: meeting.dealId,
                status: response.status,
                error,
            });
        }
    }

    private async createNoteEngagement(
        config: HubSpotConfig,
        body: string,
        contactId: string,
        dealId: string
    ): Promise<void> {
        const response = await fetch(`${this.baseUrl}/crm/v3/objects/notes`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                properties: {
                    hs_note_body: body,
                    hs_timestamp: new Date().toISOString(),
                },
                associations: [
                    {
                        to: { id: contactId },
                        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }], // Note to Contact
                    },
                    {
                        to: { id: dealId },
                        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }], // Note to Deal
                    },
                ],
            }),
        });

        if (!response.ok) {
            // Non-fatal: log warning but don't fail the whole dispatch
            const error = await response.text();
            logger.warn('HubSpot note engagement creation failed', {
                contactId,
                dealId,
                status: response.status,
                error,
            });
        }
    }

    private parseFirstName(fullName?: string): string {
        if (!fullName) return 'Unknown';
        const parts = fullName.trim().split(/\s+/);
        return parts[0] || 'Unknown';
    }

    private parseLastName(fullName?: string): string {
        if (!fullName) return '';
        const parts = fullName.trim().split(/\s+/);
        return parts.slice(1).join(' ') || '';
    }
}
