import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';

export interface InsightlyConfig {
    apiKey: string;
    /** e.g. https://api.na1.insightly.com/v3.1 — from Insightly User Settings → API */
    apiBaseUrl?: string;
}

const DEFAULT_API_BASE = 'https://api.insightly.com/v3.1';

export function normalizeInsightlyApiBaseUrl(url?: string): string {
    const trimmed = String(url || '').trim().replace(/\/+$/, '');
    return trimmed || DEFAULT_API_BASE;
}

function resolveBaseUrl(config: InsightlyConfig): string {
    return normalizeInsightlyApiBaseUrl(config.apiBaseUrl);
}

function authHeaders(apiKey: string): Record<string, string> {
    const token = Buffer.from(`${apiKey}:`).toString('base64');
    return {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
    };
}

export class InsightlyProvider {
    async verifyConnection(config: InsightlyConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${resolveBaseUrl(config)}/Users?brief=true&count_total=false`, {
                headers: authHeaders(config.apiKey),
            });
            const status = (response as unknown as { status: number }).status;
            if (response.ok) {
                return { success: true, message: 'Connected to Insightly successfully' };
            }
            if (status === 401 || status === 403) {
                return {
                    success: false,
                    message: 'Invalid API key — copy your key from Insightly → User Settings → API.',
                };
            }
            return { success: false, message: `Could not reach Insightly (HTTP ${status})` };
        } catch {
            return {
                success: false,
                message: 'Could not reach Insightly — check your API key and try again.',
            };
        }
    }

    async sendTestLead(config: InsightlyConfig): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        return this.createContact(config, {
            callId: `test-${Date.now()}`,
            type: 'lead',
            lead: {
                name: 'Test Lead (Call IQ)',
                phone: '+15551234567',
                email: 'test-lead@calliq.example',
                service: 'Connection test',
                notes: 'This test contact was created by Call IQ to verify your CRM connection.',
            },
        });
    }

    async sendLead(config: InsightlyConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.createContact(config, payload);
        if (!result.success) {
            throw new Error(result.message);
        }
        logger.info('Insightly lead delivered', { callId: payload.callId, recordUrl: result.recordUrl });
    }

    private async createContact(
        config: InsightlyConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const { lead } = payload;
        const parts = (lead.name || 'Customer').trim().split(/\s+/);
        const firstName = parts[0] || 'Customer';
        const lastName = parts.slice(1).join(' ') || 'Call';

        const body = {
            FIRST_NAME: firstName,
            LAST_NAME: lastName,
            PHONE_NUMBER: lead.phone || undefined,
            EMAIL_ADDRESS: lead.email || undefined,
            BACKGROUND: [
                lead.service ? `Service: ${lead.service}` : null,
                lead.notes ? `Notes: ${lead.notes}` : null,
                'Source: Call IQ Voice AI',
            ]
                .filter(Boolean)
                .join('\n'),
        };

        const baseUrl = resolveBaseUrl(config);
        const response = await fetch(`${baseUrl}/Contacts`, {
            method: 'POST',
            headers: authHeaders(config.apiKey),
            body: JSON.stringify(body),
        });
        const status = (response as unknown as { status: number }).status;

        if (!response.ok) {
            return {
                success: false,
                message:
                    status === 401 || status === 403
                        ? 'Insightly rejected the API key — open User Settings → API and copy the key again.'
                        : `Could not create contact in Insightly (HTTP ${status})`,
            };
        }

        const data = (await response.json()) as { CONTACT_ID?: number };
        const id = data.CONTACT_ID;
        const recordUrl = id ? `https://crm.insightly.com/Contact/Details/${id}` : undefined;

        return {
            success: true,
            message: 'Lead successfully created in Insightly',
            recordUrl,
        };
    }
}
