import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';

export interface FollowUpBossConfig {
    apiKey: string;
}

const BASE_URL = 'https://api.followupboss.com/v1';

function authHeaders(config: FollowUpBossConfig): Record<string, string> {
    const token = Buffer.from(`${config.apiKey}:`).toString('base64');
    return {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
        'X-System': 'Halla AI',
        'X-System-Key': 'callIQ',
    };
}

export class FollowUpBossProvider {
    async verifyConnection(config: FollowUpBossConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${BASE_URL}/identity`, { headers: authHeaders(config) });
            if (response.ok) return { success: true, message: 'Connected to Follow Up Boss successfully' };
            const status = (response as unknown as { status: number }).status;
            if (status === 401) {
                return { success: false, message: 'Follow Up Boss rejected that API key — copy it again from Admin → API.' };
            }
            return { success: false, message: `Could not reach Follow Up Boss (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach Follow Up Boss — check your API key and try again.' };
        }
    }

    async sendTestLead(config: FollowUpBossConfig): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        return this.createLead(config, {
            callId: `test-${Date.now()}`,
            type: 'lead',
            lead: {
                name: 'Test Lead (Halla AI)',
                phone: '+15551234567',
                email: 'test-lead@calliq.example',
                service: 'Connection test',
                notes: 'This test lead was created by Halla AI to verify your Follow Up Boss connection.',
            },
        });
    }

    async sendLead(config: FollowUpBossConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.createLead(config, payload);
        if (!result.success) throw new Error(result.message);
        logger.info('Follow Up Boss lead delivered', { callId: payload.callId, recordUrl: result.recordUrl });
    }

    private async createLead(
        config: FollowUpBossConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const { lead } = payload;
        const parts = (lead.name || 'Customer').trim().split(/\s+/);
        const firstName = parts[0] || 'Customer';
        const lastName = parts.slice(1).join(' ') || 'Call';

        const body = {
            source: 'Halla AI',
            system: 'Halla AI',
            type: 'Inquiry',
            message: lead.notes || `Service: ${lead.service || 'N/A'}`,
            person: {
                firstName,
                lastName,
                emails: lead.email ? [{ value: lead.email }] : undefined,
                phones: lead.phone ? [{ value: lead.phone }] : undefined,
            },
        };

        try {
            const response = await fetch(`${BASE_URL}/events`, {
                method: 'POST',
                headers: authHeaders(config),
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const status = (response as unknown as { status: number }).status;
                return {
                    success: false,
                    message:
                        status === 401
                            ? 'Follow Up Boss rejected that API key — copy it again from Admin → API.'
                            : `Could not create lead in Follow Up Boss (HTTP ${status})`,
                };
            }
            const data = (await response.json()) as { personId?: number };
            const recordUrl = data.personId ? `https://app.followupboss.com/2/people/view/${data.personId}` : undefined;
            return { success: true, message: 'Lead successfully created in Follow Up Boss', recordUrl };
        } catch {
            return { success: false, message: 'Could not reach Follow Up Boss — check your API key and try again.' };
        }
    }
}
