import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';
import { readHttpErrorDetail } from '../credential-utils.js';

export interface CopperConfig {
    userEmail?: string;
    apiKey?: string;
    /** OAuth Bearer token (does not expire per Copper docs) */
    accessToken?: string;
}

const BASE_URL = 'https://api.copper.com/developer_api/v1';

type CopperAccount = {
    settings?: { setting_enable_leads?: boolean };
};

function usesOAuth(config: CopperConfig): boolean {
    return Boolean(config.accessToken?.trim());
}

function authHeaders(config: CopperConfig): Record<string, string> {
    if (usesOAuth(config)) {
        return {
            Authorization: `Bearer ${config.accessToken!.trim()}`,
            'Content-Type': 'application/json',
        };
    }
    return {
        'X-PW-AccessToken': config.apiKey || '',
        'X-PW-UserEmail': config.userEmail || '',
        'X-PW-Application': 'developer_api',
        'Content-Type': 'application/json',
    };
}

/** Normalize credential shapes from the dashboard wizard or OAuth callback before storage/API calls. */
export function parseCopperConfig(raw: Record<string, unknown>): CopperConfig {
    const accessToken = String(raw.accessToken ?? '').trim();
    if (accessToken) {
        return { accessToken };
    }
    return {
        userEmail: String(raw.userEmail ?? raw.email ?? '').trim(),
        apiKey: String(raw.apiKey ?? raw.api_token ?? '').trim(),
    };
}

function credentialErrorMessage(status: number, context: 'account' | 'lead'): string {
    if (status === 401 || status === 403) {
        if (context === 'account') {
            return 'Copper rejected those credentials. Use the email of the user who generated the API key, from System settings → API Keys in Copper.';
        }
        return 'Copper accepted the login but blocked creating a lead. Confirm Leads are enabled in Copper and the API key owner can create leads.';
    }
    return context === 'account'
        ? `Could not reach Copper (HTTP ${status})`
        : `Could not create lead in Copper (HTTP ${status})`;
}

function mapCopperDetail(detail: string | undefined, status: number, context: 'account' | 'lead'): string {
    if (detail && /authentication error/i.test(detail)) {
        return 'Copper could not authenticate that email and API key. This often happens on Starter/Basic plans or after a trial ends — Copper API access requires Professional or Business. Also confirm the email matches the user who generated the key at app.copper.com/settings/api-keys.';
    }
    return detail || credentialErrorMessage(status, context);
}

type FetchLikeResponse = { status: number; ok: boolean; json(): Promise<unknown> };

function httpStatusCode(response: FetchLikeResponse): number {
    return response.status;
}
async function readCopperError(response: FetchLikeResponse): Promise<string | undefined> {
    return readHttpErrorDetail(response);
}

export class CopperProvider {
    async verifyConnection(raw: Record<string, unknown> | CopperConfig): Promise<{ success: boolean; message: string }> {
        const config = parseCopperConfig(raw as Record<string, unknown>);
        if (!usesOAuth(config)) {
            if (!config.userEmail?.includes('@')) {
                return { success: false, message: 'Enter the same email address you use to sign in to Copper.' };
            }
            if (!config.apiKey) {
                return { success: false, message: 'Paste your Copper API key from System settings → API Keys.' };
            }
        } else if (!config.accessToken) {
            return { success: false, message: 'Copper OAuth token missing — reconnect Copper.' };
        }
        try {
            const response = (await fetch(`${BASE_URL}/account`, {
                headers: authHeaders(config),
            })) as unknown as FetchLikeResponse;
            if (!response.ok) {
                const detail = await readCopperError(response);
                const httpStatus = httpStatusCode(response);
                return {
                    success: false,
                    message: mapCopperDetail(detail, httpStatus, 'account'),
                };
            }
            const account = (await response.json()) as CopperAccount;
            if (account.settings?.setting_enable_leads === false) {
                return {
                    success: false,
                    message: 'Leads are disabled in your Copper account. Turn on Leads in Copper settings, then try again.',
                };
            }
            return { success: true, message: 'Connected to Copper successfully' };
        } catch {
            return { success: false, message: 'Could not reach Copper — check your credentials and try again.' };
        }
    }

    async sendTestLead(raw: Record<string, unknown> | CopperConfig): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const config = parseCopperConfig(raw as Record<string, unknown>);
        const verify = await this.verifyConnection(config);
        if (!verify.success) return verify;

        return this.createLead(config, {
            callId: `test-${Date.now()}`,
            type: 'lead',
            lead: {
                name: 'Test Lead (Halla AI)',
                phone: '+15551234567',
                email: 'test-lead@calliq.example',
                service: 'Connection test',
                notes: 'This test lead was created by Halla AI to verify your Copper connection.',
            },
        });
    }

    async sendLead(raw: Record<string, unknown> | CopperConfig, payload: IntegrationPayload): Promise<void> {
        const config = parseCopperConfig(raw as Record<string, unknown>);
        const result = await this.createLead(config, payload);
        if (!result.success) throw new Error(result.message);
        logger.info('Copper lead delivered', { callId: payload.callId, recordUrl: result.recordUrl });
    }

    private async createLead(
        config: CopperConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const { lead } = payload;
        const parts = (lead.name || 'Customer').trim().split(/\s+/);
        const firstName = parts[0] || 'Customer';
        const lastName = parts.slice(1).join(' ') || 'Call';

        const body: Record<string, unknown> = {
            name: `${firstName} ${lastName}`.trim(),
            details: lead.notes || `Service: ${lead.service || 'N/A'}`,
        };
        if (lead.email) {
            body.email = { email: lead.email, category: 'work' };
        }
        if (lead.phone) {
            body.phone_numbers = [{ number: lead.phone, category: 'mobile' }];
        }

        try {
            const response = (await fetch(`${BASE_URL}/leads`, {
                method: 'POST',
                headers: authHeaders(config),
                body: JSON.stringify(body),
            })) as unknown as FetchLikeResponse;
            if (!response.ok) {
                const detail = await readCopperError(response);
                const httpStatus = httpStatusCode(response);
                return {
                    success: false,
                    message: mapCopperDetail(detail, httpStatus, 'lead'),
                };
            }
            const data = (await response.json()) as { id?: number };
            const recordUrl = data.id ? `https://app.copper.com/companies/leads/${data.id}` : undefined;
            return { success: true, message: 'Lead successfully created in Copper', recordUrl };
        } catch {
            return { success: false, message: 'Could not reach Copper — check your credentials and try again.' };
        }
    }
}
