import { logger } from '../../logger.js';
import type { IntegrationPayload } from '../integration.service.js';
import { leadNotes, splitLeadName } from '../provider-lead-utils.js';

export interface YardiConfig {
    /** Voyager/RentCafe API base URL from your Yardi representative */
    apiDomain: string;
    clientId: string;
    clientSecret: string;
}

function normalizeBaseUrl(domain: string): string {
    let d = domain.trim();
    if (!d) return '';
    if (!/^https?:\/\//i.test(d)) d = `https://${d}`;
    return d.replace(/\/$/, '');
}

function authHeaders(config: YardiConfig): Record<string, string> {
    const token = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    return {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
    };
}

export class YardiProvider {
    async verifyConnection(config: YardiConfig): Promise<{ success: boolean; message: string }> {
        const base = normalizeBaseUrl(config.apiDomain);
        if (!base) {
            return { success: false, message: 'Enter the API URL your Yardi representative gave you.' };
        }
        try {
            const response = await fetch(`${base}/properties?limit=1`, { headers: authHeaders(config) });
            const status = (response as unknown as { status: number }).status;
            if (response.ok) return { success: true, message: 'Connected to Yardi successfully' };
            if (status === 401 || status === 403) {
                return { success: false, message: 'Yardi rejected those credentials — check your Client ID, secret, and API URL.' };
            }
            return { success: false, message: `Could not reach Yardi (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach Yardi — check your API URL and credentials.' };
        }
    }

    async sendTest(config: YardiConfig): Promise<{ success: boolean; message: string }> {
        return this.createLead(config, {
            callId: `test-${Date.now()}`,
            type: 'lead',
            lead: {
                name: 'Test Lead (Call IQ)',
                phone: '+15551234567',
                email: 'test-lead@calliq.example',
                service: 'Connection test',
                notes: 'This test lead was created by Call IQ to verify your Yardi connection.',
            },
        });
    }

    async sendLead(config: YardiConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.createLead(config, payload);
        if (!result.success) throw new Error(result.message);
        logger.info('Yardi lead delivered', { callId: payload.callId });
    }

    private async createLead(
        config: YardiConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const base = normalizeBaseUrl(config.apiDomain);
        if (!base) return { success: false, message: 'Yardi API URL is required' };

        const { lead } = payload;
        const { first, last } = splitLeadName(lead.name);
        const body = {
            firstName: first,
            lastName: last,
            email: lead.email || undefined,
            phone: lead.phone || undefined,
            comments: leadNotes(payload),
            source: 'Call IQ',
        };

        try {
            const response = await fetch(`${base}/leads`, {
                method: 'POST',
                headers: authHeaders(config),
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const status = (response as unknown as { status: number }).status;
                return {
                    success: false,
                    message:
                        status === 401 || status === 403
                            ? 'Yardi rejected those credentials — check your Client ID, secret, and API URL.'
                            : `Could not create lead in Yardi (HTTP ${status})`,
                };
            }
            return { success: true, message: 'Lead successfully created in Yardi' };
        } catch {
            return { success: false, message: 'Could not reach Yardi — check your API URL and credentials.' };
        }
    }
}
