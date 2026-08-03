import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';

export interface ZohoConfig {
    dataCenter: string;
    /** Legacy Self Client flow */
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    /** Short-lived; Call IQ stores refresh tokens from OAuth */
    accessToken?: string;
    /** From token response — preferred API base (region-specific) */
    apiDomain?: string;
    /** From OAuth callback — region-specific accounts host for token refresh */
    accountsServer?: string;
}

const DC_HOSTS: Record<
    string,
    { accounts: string; api: string; crm: string; dataCenter: string }
> = {
    com: {
        accounts: 'https://accounts.zoho.com',
        api: 'https://www.zohoapis.com',
        crm: 'https://crm.zoho.com',
        dataCenter: 'com',
    },
    eu: {
        accounts: 'https://accounts.zoho.eu',
        api: 'https://www.zohoapis.eu',
        crm: 'https://crm.zoho.eu',
        dataCenter: 'eu',
    },
    in: {
        accounts: 'https://accounts.zoho.in',
        api: 'https://www.zohoapis.in',
        crm: 'https://crm.zoho.in',
        dataCenter: 'in',
    },
    au: {
        accounts: 'https://accounts.zoho.com.au',
        api: 'https://www.zohoapis.com.au',
        crm: 'https://crm.zoho.com.au',
        dataCenter: 'com.au',
    },
    jp: {
        accounts: 'https://accounts.zoho.jp',
        api: 'https://www.zohoapis.jp',
        crm: 'https://crm.zoho.jp',
        dataCenter: 'jp',
    },
    ca: {
        accounts: 'https://accounts.zohocloud.ca',
        api: 'https://www.zohoapis.ca',
        crm: 'https://crm.zohocloud.ca',
        dataCenter: 'ca',
    },
};

export function normalizeDataCenter(dataCenter: string): string {
    const d = dataCenter.trim().toLowerCase();
    if (d === 'com.au') return 'au';
    return d;
}

function dcKey(config: ZohoConfig): string {
    const normalized = normalizeDataCenter(config.dataCenter);
    return DC_HOSTS[normalized] ? normalized : 'com';
}

export function zohoAccountsHost(dataCenter: string): string {
    const key = normalizeDataCenter(dataCenter);
    return DC_HOSTS[key]?.accounts ?? `https://accounts.zoho.${key}`;
}

export function dataCenterFromAccountsServer(accountsServer: string): string {
    const u = accountsServer.trim().toLowerCase().replace(/\/$/, '');
    for (const hosts of Object.values(DC_HOSTS)) {
        if (u === hosts.accounts.toLowerCase()) return hosts.dataCenter;
    }
    if (u.includes('accounts.zoho.com.au')) return 'com.au';
    if (u.includes('accounts.zohocloud.ca')) return 'ca';
    if (u.includes('accounts.zoho.eu')) return 'eu';
    if (u.includes('accounts.zoho.in')) return 'in';
    if (u.includes('accounts.zoho.jp')) return 'jp';
    if (u.includes('accounts.zoho.com.cn')) return 'cn';
    if (u.includes('accounts.zoho.com')) return 'com';
    return 'com';
}

export function dataCenterFromLocation(location: string): string {
    const loc = location.trim().toLowerCase();
    if (loc === 'au') return 'com.au';
    if (loc === 'ca') return 'ca';
    if (loc === 'eu') return 'eu';
    if (loc === 'in') return 'in';
    if (loc === 'jp') return 'jp';
    if (loc === 'us' || loc === 'com') return 'com';
    return loc;
}

function accountsBase(config: ZohoConfig): string {
    return (config.accountsServer?.trim() || zohoAccountsHost(config.dataCenter)).replace(/\/$/, '');
}

function apiHost(config: ZohoConfig): string {
    if (config.apiDomain?.trim()) return config.apiDomain.trim().replace(/\/$/, '');
    const key = dcKey(config);
    return DC_HOSTS[key]?.api ?? `https://www.zohoapis.${key}`;
}

function crmHost(config: ZohoConfig): string {
    const key = dcKey(config);
    return DC_HOSTS[key]?.crm ?? `https://crm.zoho.${key}`;
}

function resolveOAuthClient(config: ZohoConfig): { clientId: string; clientSecret: string } {
    const clientId = (config.clientId || process.env.ZOHO_CLIENT_ID || '').trim();
    const clientSecret = (config.clientSecret || process.env.ZOHO_CLIENT_SECRET || '').trim();
    return { clientId, clientSecret };
}

async function getAccessToken(config: ZohoConfig): Promise<string> {
    const refreshToken = (config.refreshToken || '').trim();
    if (!refreshToken) {
        if (config.accessToken?.trim()) return config.accessToken.trim();
        throw new Error('Zoho refresh token missing — reconnect Zoho CRM.');
    }

    const { clientId, clientSecret } = resolveOAuthClient(config);
    if (!clientId || !clientSecret) {
        throw new Error('Zoho OAuth is not configured on the server');
    }

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    });
    const response = await fetch(`${accountsBase(config)}/oauth/v2/token?${params.toString()}`, {
        method: 'POST',
    });
    const data = (await response.json()) as { access_token?: string; error?: string };
    if (!response.ok || !data.access_token) {
        throw new Error(data.error || 'Could not refresh Zoho access token');
    }
    return data.access_token;
}

export class ZohoProvider {
    async verifyConnection(config: ZohoConfig): Promise<{ success: boolean; message: string }> {
        try {
            const token = await getAccessToken(config);
            const response = await fetch(`${apiHost(config)}/crm/v3/users?type=CurrentUser`, {
                headers: { Authorization: `Zoho-oauthtoken ${token}` },
            });
            const status = (response as unknown as { status: number }).status;
            if (response.ok) {
                return { success: true, message: 'Connected to Zoho CRM successfully' };
            }
            if (status === 401) {
                return {
                    success: false,
                    message: 'Zoho rejected those credentials — double-check your Client ID, Client Secret, and Refresh Token.',
                };
            }
            return { success: false, message: `Could not reach Zoho CRM (HTTP ${status})` };
        } catch (error) {
            const msg = String(error);
            if (/no_org/i.test(msg)) {
                return {
                    success: false,
                    message:
                        'Your Zoho account has no CRM organization — create one at crm.zoho.com or use refresh-token connect and pick your CRM org in Self Client.',
                };
            }
            return {
                success: false,
                message: 'Could not connect to Zoho CRM — check your data center and credentials and try again.',
            };
        }
    }

    async sendTestLead(config: ZohoConfig): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        return this.createLead(config, {
            callId: `test-${Date.now()}`,
            type: 'lead',
            lead: {
                name: 'Test Lead (Call IQ)',
                phone: '+15551234567',
                email: 'test-lead@calliq.example',
                service: 'Connection test',
                notes: 'This test lead was created by Call IQ to verify your Zoho CRM connection.',
            },
        });
    }

    async sendLead(config: ZohoConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.createLead(config, payload);
        if (!result.success) throw new Error(result.message);
        logger.info('Zoho CRM lead delivered', { callId: payload.callId, recordUrl: result.recordUrl });
    }

    private async createLead(
        config: ZohoConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const { lead } = payload;
        const parts = (lead.name || 'Customer').trim().split(/\s+/);
        const firstName = parts[0] || 'Customer';
        const lastName = parts.slice(1).join(' ') || 'Call';

        try {
            const token = await getAccessToken(config);
            const body = {
                data: [
                    {
                        Last_Name: lastName,
                        First_Name: firstName,
                        Phone: lead.phone || undefined,
                        Email: lead.email || undefined,
                        Company: lead.service || 'Call IQ Lead',
                        Description: lead.notes || `Service: ${lead.service || 'N/A'}`,
                        Lead_Source: 'Call IQ',
                    },
                ],
            };
            const response = await fetch(`${apiHost(config)}/crm/v3/Leads`, {
                method: 'POST',
                headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = (await response.json()) as {
                data?: Array<{ status?: string; message?: string; details?: { id?: string } }>;
            };
            const entry = data?.data?.[0];
            if (!response.ok || entry?.status !== 'success') {
                const status = (response as unknown as { status: number }).status;
                return {
                    success: false,
                    message: entry?.message || `Could not create lead in Zoho CRM (HTTP ${status})`,
                };
            }
            const id = entry.details?.id;
            const recordUrl = id ? `${crmHost(config)}/crm/org/tab/Leads/${id}` : undefined;
            return { success: true, message: 'Lead successfully created in Zoho CRM', recordUrl };
        } catch {
            return { success: false, message: 'Could not reach Zoho CRM — check your credentials and try again.' };
        }
    }
}
