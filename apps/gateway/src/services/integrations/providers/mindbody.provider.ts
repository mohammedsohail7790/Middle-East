import { logger } from '../../logger.js';
import type { IntegrationPayload } from '../integration.service.js';
import { leadNotes, splitLeadName } from '../provider-lead-utils.js';

export interface MindbodyConfig {
    siteId: string;
    apiKey: string;
}

const BASE_URL = 'https://api.mindbodyonline.com/public/v6';

function authHeaders(config: MindbodyConfig): Record<string, string> {
    return {
        'Api-Key': config.apiKey,
        SiteId: config.siteId,
        'Content-Type': 'application/json',
    };
}

export class MindbodyProvider {
    async verifyConnection(config: MindbodyConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${BASE_URL}/site/sites?SiteIds=${encodeURIComponent(config.siteId)}`, {
                headers: authHeaders(config),
            });
            const status = (response as unknown as { status: number }).status;
            if (response.ok) return { success: true, message: 'Connected to Mindbody successfully' };
            if (status === 401 || status === 403) {
                return { success: false, message: 'Mindbody rejected those credentials — check your site ID and API key.' };
            }
            return { success: false, message: `Could not reach Mindbody (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach Mindbody — check your credentials and try again.' };
        }
    }

    async sendTest(config: MindbodyConfig): Promise<{ success: boolean; message: string }> {
        const verify = await this.verifyConnection(config);
        return verify.success
            ? { success: true, message: 'Mindbody connection verified — clients from calls will sync as new clients.' }
            : { success: false, message: verify.message };
    }

    async sendLead(config: MindbodyConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.addClient(config, payload);
        if (!result.success) throw new Error(result.message);
        logger.info('Mindbody client delivered', { callId: payload.callId });
    }

    private async addClient(
        config: MindbodyConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string }> {
        const { lead } = payload;
        const { first, last } = splitLeadName(lead.name);
        const body = {
            FirstName: first,
            LastName: last,
            Email: lead.email || undefined,
            MobilePhone: lead.phone || undefined,
            Notes: leadNotes(payload),
        };

        try {
            const response = await fetch(`${BASE_URL}/client/addclient`, {
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
                            ? 'Mindbody rejected those credentials — check your site ID and API key.'
                            : `Could not add client in Mindbody (HTTP ${status})`,
                };
            }
            return { success: true, message: 'Client successfully added in Mindbody' };
        } catch {
            return { success: false, message: 'Could not reach Mindbody — check your credentials and try again.' };
        }
    }
}
