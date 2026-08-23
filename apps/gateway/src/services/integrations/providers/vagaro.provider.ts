import { logger } from '../../logger.js';
import type { IntegrationPayload } from '../integration.service.js';
import { leadNotes, splitLeadName } from '../provider-lead-utils.js';

export interface VagaroConfig {
    businessId: string;
    apiKey: string;
}

function authHeaders(config: VagaroConfig): Record<string, string> {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-Business-Id': config.businessId,
    };
}

export class VagaroProvider {
    async verifyConnection(config: VagaroConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(
                `https://api.vagaro.com/v2/merchants/${encodeURIComponent(config.businessId)}`,
                { headers: authHeaders(config) }
            );
            const status = (response as unknown as { status: number }).status;
            if (response.ok) return { success: true, message: 'Connected to Vagaro successfully' };
            if (status === 401 || status === 403) {
                return { success: false, message: 'Vagaro rejected those credentials — check your business ID and API key.' };
            }
            return { success: false, message: `Could not reach Vagaro (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach Vagaro — check your credentials and try again.' };
        }
    }

    async sendTest(config: VagaroConfig): Promise<{ success: boolean; message: string }> {
        const verify = await this.verifyConnection(config);
        return verify.success
            ? { success: true, message: 'Vagaro connection verified — new callers will sync as customers.' }
            : { success: false, message: verify.message };
    }

    async sendLead(config: VagaroConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.createCustomer(config, payload);
        if (!result.success) throw new Error(result.message);
        logger.info('Vagaro customer delivered', { callId: payload.callId });
    }

    private async createCustomer(
        config: VagaroConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string }> {
        const { lead } = payload;
        const { first, last } = splitLeadName(lead.name);
        const body = {
            firstName: first,
            lastName: last,
            email: lead.email || undefined,
            mobilePhone: lead.phone || undefined,
            notes: leadNotes(payload),
            source: 'Halla AI',
        };

        try {
            const response = await fetch(
                `https://api.vagaro.com/v2/merchants/${encodeURIComponent(config.businessId)}/customers`,
                {
                    method: 'POST',
                    headers: authHeaders(config),
                    body: JSON.stringify(body),
                }
            );
            if (!response.ok) {
                const status = (response as unknown as { status: number }).status;
                return {
                    success: false,
                    message:
                        status === 401 || status === 403
                            ? 'Vagaro rejected those credentials — check your business ID and API key.'
                            : `Could not create customer in Vagaro (HTTP ${status})`,
                };
            }
            return { success: true, message: 'Customer successfully created in Vagaro' };
        } catch {
            return { success: false, message: 'Could not reach Vagaro — check your credentials and try again.' };
        }
    }
}
