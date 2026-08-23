import { logger } from '../../logger.js';
import type { IntegrationPayload } from '../integration.service.js';
import { leadNotes, splitLeadName } from '../provider-lead-utils.js';

export interface ClioConfig {
    accessToken?: string;
    refreshToken?: string;
}

const BASE_URL = 'https://app.clio.com/api/v4';
const TOKEN_URL = 'https://app.clio.com/oauth/token';

function authHeaders(token: string): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}

function oauthClient(): { clientId: string; clientSecret: string } {
    return {
        clientId: (process.env.CLIO_CLIENT_ID || '').trim(),
        clientSecret: (process.env.CLIO_CLIENT_SECRET || '').trim(),
    };
}

export async function refreshClioAccessToken(refreshToken: string): Promise<string> {
    const { clientId, clientSecret } = oauthClient();
    if (!clientId || !clientSecret) {
        throw new Error('Clio OAuth is not configured on the server');
    }
    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });
    const data = (await response.json()) as { access_token?: string; error?: string };
    if (!response.ok || !data.access_token) {
        throw new Error(data.error || 'Could not refresh Clio access token');
    }
    return data.access_token;
}

async function resolveAccessToken(config: ClioConfig): Promise<string> {
    if (config.refreshToken?.trim()) {
        return refreshClioAccessToken(config.refreshToken.trim());
    }
    const direct = config.accessToken?.trim();
    if (direct) return direct;
    throw new Error('Clio is not connected — reconnect from Integrations.');
}

export class ClioProvider {
    async verifyConnection(config: ClioConfig): Promise<{ success: boolean; message: string }> {
        try {
            const token = await resolveAccessToken(config);
            const response = await fetch(`${BASE_URL}/users/who_am_i?fields=id`, {
                headers: authHeaders(token),
            });
            const status = (response as unknown as { status: number }).status;
            if (response.ok) return { success: true, message: 'Connected to Clio successfully' };
            if (status === 401) {
                return {
                    success: false,
                    message: 'Clio rejected the connection — click Connect with Clio and authorize again.',
                };
            }
            return { success: false, message: `Could not reach Clio (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach Clio — reconnect from Integrations and try again.' };
        }
    }

    async sendTestLead(config: ClioConfig): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        return this.createContact(config, {
            callId: `test-${Date.now()}`,
            type: 'lead',
            lead: {
                name: 'Test Lead (Halla AI)',
                phone: '+15551234567',
                email: 'test-lead@calliq.example',
                service: 'Connection test',
                notes: 'This test contact was created by Halla AI to verify your Clio connection.',
            },
        });
    }

    async sendLead(config: ClioConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.createContact(config, payload);
        if (!result.success) throw new Error(result.message);
        logger.info('Clio contact delivered', { callId: payload.callId, recordUrl: result.recordUrl });
    }

    private async createContact(
        config: ClioConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const { lead } = payload;
        const { first, last } = splitLeadName(lead.name);
        const body = {
            data: {
                type: 'Person',
                first_name: first,
                last_name: last,
                email_addresses: lead.email ? [{ address: lead.email, name: 'Work', default_email: true }] : undefined,
                phone_numbers: lead.phone ? [{ number: lead.phone, name: 'Mobile', default_number: true }] : undefined,
                notes: leadNotes(payload),
            },
        };

        try {
            const token = await resolveAccessToken(config);
            const response = await fetch(`${BASE_URL}/contacts.json`, {
                method: 'POST',
                headers: authHeaders(token),
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const status = (response as unknown as { status: number }).status;
                const errorBody = await response.text().catch(() => '');
                logger.error('Clio contact creation failed', { status, errorBody });
                return {
                    success: false,
                    message:
                        status === 401
                            ? 'Clio rejected the connection — reconnect from Integrations.'
                            : status === 403
                              ? 'Clio blocked this request (HTTP 403) — the connected Clio user may lack permission to create contacts, or the app needs write access approved in Clio. Reconnect and check your Clio user role.'
                              : `Could not create contact in Clio (HTTP ${status})`,
                };
            }
            const data = (await response.json()) as { data?: { id?: number } };
            const id = data.data?.id;
            const recordUrl = id ? `https://app.clio.com/contacts/${id}` : undefined;
            return { success: true, message: 'Contact successfully created in Clio', recordUrl };
        } catch {
            return { success: false, message: 'Could not reach Clio — reconnect from Integrations and try again.' };
        }
    }
}
