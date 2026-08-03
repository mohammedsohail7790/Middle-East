import { logger } from '../../logger.js';
import type { IntegrationPayload } from '../integration.service.js';
import { leadNotes, splitLeadName } from '../provider-lead-utils.js';

export interface MyCaseConfig {
    /** OAuth access token or API bearer token from MyCase. */
    apiKey: string;
}

const BASE_URL = 'https://api.mycase.com/v1';

function authHeaders(token: string): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}

export class MyCaseProvider {
    async verifyConnection(config: MyCaseConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${BASE_URL}/users/me`, { headers: authHeaders(config.apiKey) });
            const status = (response as unknown as { status: number }).status;
            if (response.ok) return { success: true, message: 'Connected to MyCase successfully' };
            if (status === 401) {
                return { success: false, message: 'MyCase rejected that connection code — paste a fresh access token.' };
            }
            return { success: false, message: `Could not reach MyCase (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach MyCase — check your connection code and try again.' };
        }
    }

    async sendTestLead(config: MyCaseConfig): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        return this.createLead(config, {
            callId: `test-${Date.now()}`,
            type: 'lead',
            lead: {
                name: 'Test Lead (Call IQ)',
                phone: '+15551234567',
                email: 'test-lead@calliq.example',
                service: 'Connection test',
                notes: 'This test lead was created by Call IQ to verify your MyCase connection.',
            },
        });
    }

    async sendLead(config: MyCaseConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.createLead(config, payload);
        if (!result.success) throw new Error(result.message);
        logger.info('MyCase lead delivered', { callId: payload.callId, recordUrl: result.recordUrl });
    }

    private async createLead(
        config: MyCaseConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const { lead } = payload;
        const { first, last } = splitLeadName(lead.name);
        const body = {
            first_name: first,
            last_name: last,
            email: lead.email || undefined,
            cell_phone_number: lead.phone || undefined,
            notes: leadNotes(payload),
            source: 'Call IQ',
        };

        try {
            const response = await fetch(`${BASE_URL}/leads`, {
                method: 'POST',
                headers: authHeaders(config.apiKey),
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const status = (response as unknown as { status: number }).status;
                return {
                    success: false,
                    message:
                        status === 401
                            ? 'MyCase rejected that connection code — paste a fresh access token.'
                            : `Could not create lead in MyCase (HTTP ${status})`,
                };
            }
            const data = (await response.json()) as { id?: number };
            const recordUrl = data.id ? `https://app.mycase.com/leads/${data.id}` : undefined;
            return { success: true, message: 'Lead successfully created in MyCase', recordUrl };
        } catch {
            return { success: false, message: 'Could not reach MyCase — check your connection code and try again.' };
        }
    }
}
