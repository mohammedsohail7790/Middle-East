import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';

export interface PipedriveConfig {
    accessToken: string;
    /** e.g. https://acme.pipedrive.com */
    apiDomain: string;
}

function apiBase(config: PipedriveConfig): string {
    const domain = (config.apiDomain || 'https://api.pipedrive.com').replace(/\/$/, '');
    if (domain.includes('api.pipedrive.com')) return 'https://api.pipedrive.com/v1';
    return `${domain}/api/v1`;
}

function authHeaders(token: string): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}

function splitName(fullName?: string): { first: string; last: string } {
    const parts = (fullName || 'Unknown').trim().split(/\s+/);
    return { first: parts[0] || 'Unknown', last: parts.slice(1).join(' ') || '' };
}

export class PipedriveProvider {
    async verifyConnection(config: PipedriveConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${apiBase(config)}/users/me`, {
                headers: authHeaders(config.accessToken),
            });
            const status = (response as unknown as { status: number }).status;
            if (response.ok) {
                return { success: true, message: 'Connected to Pipedrive successfully' };
            }
            if (status === 401) {
                return { success: false, message: 'Pipedrive sign-in expired — disconnect and connect again.' };
            }
            return { success: false, message: `Could not reach Pipedrive (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach Pipedrive — try again in a moment.' };
        }
    }

    async sendTestLead(config: PipedriveConfig): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        return this.createLead(config, {
            callId: `test-${Date.now()}`,
            type: 'lead',
            lead: {
                name: 'Test Lead (Call IQ)',
                phone: '+15551234567',
                email: 'test-lead@calliq.example',
                service: 'Connection test',
                notes: 'This test lead was created by Call IQ to verify your CRM connection.',
            },
        });
    }

    async sendLead(config: PipedriveConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.createLead(config, payload);
        if (!result.success) {
            throw new Error(result.message);
        }
        logger.info('Pipedrive lead delivered', { callId: payload.callId, recordUrl: result.recordUrl });
    }

    private async createLead(
        config: PipedriveConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const { lead } = payload;
        const { first, last } = splitName(lead.name);
        const base = apiBase(config);
        const headers = authHeaders(config.accessToken);

        const personRes = await fetch(`${base}/persons`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: lead.name || `${first} ${last}`.trim(),
                phone: lead.phone ? [{ value: lead.phone, primary: true, label: 'work' }] : undefined,
                email: lead.email ? [{ value: lead.email, primary: true, label: 'work' }] : undefined,
            }),
        });

        if (!personRes.ok) {
            const err = await personRes.text();
            return { success: false, message: `Could not create contact in Pipedrive: ${err.slice(0, 120)}` };
        }

        const person = (await personRes.json()) as { data?: { id: number } };
        const personId = person.data?.id;
        if (!personId) {
            return { success: false, message: 'Pipedrive did not return a contact ID.' };
        }

        const dealTitle = `${lead.service || 'Service Request'} — ${lead.name || 'Customer'}`;
        const dealRes = await fetch(`${base}/deals`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                title: dealTitle,
                person_id: personId,
                visible_to: '3',
            }),
        });

        if (!dealRes.ok) {
            const err = await dealRes.text();
            return { success: false, message: `Contact created but deal failed: ${err.slice(0, 120)}` };
        }

        const deal = (await dealRes.json()) as { data?: { id: number; title: string } };
        const dealId = deal.data?.id;
        const recordUrl = dealId
            ? `${config.apiDomain.replace(/\/$/, '')}/deal/${dealId}`
            : undefined;

        return {
            success: true,
            message: dealId
                ? `Lead created in Pipedrive — deal "${deal.data?.title || dealTitle}"`
                : 'Lead created in Pipedrive',
            recordUrl,
        };
    }
}
