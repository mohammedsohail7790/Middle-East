import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';
import { voiceDb } from '../../voice/tenant-scope.js';
import { connectionStore } from '../connection-store.service.js';
import { getSalesforceOAuthConfig } from '../oauth-config.js';

export interface SalesforceConfig {
    instanceUrl: string;
    accessToken: string;
    refreshToken?: string;
    tenantId?: string;
}

/**
 * Salesforce Integration Provider
 * Docs: https://developer.salesforce.com/docs/apis
 *
 * Handles:
 *  - Automatic access token refresh via refresh_token (fix: tokens expire in ~2h)
 *  - Upsert-by-phone to prevent duplicate Lead records
 *  - Proper Company field from caller context (fix: was hardcoded 'Halla AI Lead')
 */
export class SalesforceProvider {
    /**
     * Refresh the Salesforce access token using the stored refresh token.
     * Persists the new access token back to voice_tenants so subsequent calls use it.
     */
    private async refreshAccessToken(config: SalesforceConfig): Promise<string> {
        if (!config.refreshToken) {
            throw new Error('Salesforce refresh token not available — tenant must re-authenticate');
        }

        let loginUrl =
            process.env.SALESFORCE_LOGIN_URL?.trim().replace(/\/$/, '') || 'https://login.salesforce.com';
        let oauthClientId = process.env.SALESFORCE_CLIENT_ID;
        let oauthClientSecret = process.env.SALESFORCE_CLIENT_SECRET;

        if (config.tenantId) {
            const configEnv = getSalesforceOAuthConfig();
            const stored = await connectionStore.getDecryptedCredentials<{
                clientId?: string;
                clientSecret?: string;
            }>(config.tenantId, 'salesforce');
            const resolvedClientId = stored?.clientId?.trim() || configEnv.clientId;
            const resolvedClientSecret = stored?.clientSecret?.trim() || configEnv.clientSecret;
            if (resolvedClientId && resolvedClientSecret) {
                oauthClientId = resolvedClientId;
                oauthClientSecret = resolvedClientSecret;
                loginUrl = configEnv.loginUrl;
            }
        }

        if (!oauthClientId || !oauthClientSecret) {
            throw new Error('SALESFORCE_CLIENT_ID / SALESFORCE_CLIENT_SECRET not configured');
        }

        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: oauthClientId,
            client_secret: oauthClientSecret,
            refresh_token: config.refreshToken,
        });

        const response = await fetch(`${loginUrl}/services/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Salesforce token refresh failed (${response.status}): ${body}`);
        }

        const data = (await response.json()) as { access_token: string; instance_url?: string };
        const newToken = data.access_token;
        const newInstanceUrl = data.instance_url || config.instanceUrl;

        // Persist refreshed token so the next call doesn't need to refresh again
        if (config.tenantId) {
            try {
                await voiceDb.query(
                    `UPDATE public.voice_tenants
                     SET salesforce_access_token = $2, salesforce_instance_url = $3, updated_at = NOW()
                     WHERE id = $1`,
                    [config.tenantId, newToken, newInstanceUrl]
                );
            } catch (err) {
                logger.warn('Salesforce token persist failed', { tenantId: config.tenantId, error: String(err) });
            }
        }

        config.accessToken = newToken;
        config.instanceUrl = newInstanceUrl;

        logger.info('Salesforce access token refreshed', { tenantId: config.tenantId });
        return newToken;
    }

    /**
     * Make a Salesforce API request, automatically retrying once after a 401
     * by refreshing the access token.
     */
    private async sfetch(
        config: SalesforceConfig,
        path: string,
        init: RequestInit
    ): Promise<globalThis.Response> {
        const makeHeaders = (token: string): Record<string, string> => ({
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        });

        let httpRes = (await fetch(`${config.instanceUrl}${path}`, {
            ...init,
            headers: { ...makeHeaders(config.accessToken), ...(init.headers as Record<string, string> || {}) },
        })) as globalThis.Response;

        // Token expired — refresh and retry once
        const statusCode = (httpRes as unknown as { status: number }).status;
        if (statusCode === 401 && config.refreshToken) {
            logger.info('Salesforce token expired, refreshing', { tenantId: config.tenantId });
            const newToken = await this.refreshAccessToken(config);
            httpRes = (await fetch(`${config.instanceUrl}${path}`, {
                ...init,
                headers: { ...makeHeaders(newToken), ...(init.headers as Record<string, string> || {}) },
            })) as globalThis.Response;
        }

        return httpRes;
    }

    async sendLead(config: SalesforceConfig, payload: IntegrationPayload): Promise<void> {
        const { lead } = payload;

        // Try to find existing Lead by phone to prevent duplicates
        const existingId = lead.phone
            ? await this.findLeadByPhone(config, lead.phone)
            : null;

        const company = lead.notes?.match(/company[:\s]+([^\n,]+)/i)?.[1]?.trim()
            || lead.service
            || 'Inbound Call';

        const leadData = {
            FirstName: this.parseFirstName(lead.name),
            LastName: this.parseLastName(lead.name) || 'Unknown',
            Phone: lead.phone || '',
            Company: company,
            Status: 'Open - Not Contacted',
            LeadSource: 'Halla AI Voice AI',
            Description: [
                `Service: ${lead.service || 'Not specified'}`,
                `Preferred Time: ${lead.preferred_time || 'ASAP'}`,
                `Notes: ${lead.notes || 'None'}`,
                `Call ID: ${payload.callId}`,
            ].join('\n'),
        };

        let response: globalThis.Response;
        if (existingId) {
            // Update existing lead (upsert — avoids duplicates on repeat callers)
            response = await this.sfetch(
                config,
                `/services/data/v58.0/sobjects/Lead/${existingId}`,
                { method: 'PATCH', body: JSON.stringify(leadData) }
            );
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Salesforce lead update failed (${response.status}): ${error}`);
            }
            logger.info('Salesforce lead updated (existing)', {
                callId: payload.callId,
                leadId: existingId,
                service: lead.service,
            });
        } else {
            // Create new lead
            response = await this.sfetch(
                config,
                `/services/data/v58.0/sobjects/Lead`,
                { method: 'POST', body: JSON.stringify(leadData) }
            );
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Salesforce lead creation failed (${response.status}): ${error}`);
            }
            const result = (await response.json()) as { id: string };
            logger.info('Salesforce lead created', {
                callId: payload.callId,
                leadId: result.id,
                service: lead.service,
            });
        }
    }

    /** Look up an existing Lead by phone number to prevent duplicates. */
    private async findLeadByPhone(config: SalesforceConfig, phone: string): Promise<string | null> {
        const normalizedPhone = phone.replace(/[^\d+]/g, '');
        const soql = `SELECT Id FROM Lead WHERE Phone = '${normalizedPhone.replace(/'/g, "\\'")}' LIMIT 1`;
        const encodedQuery = encodeURIComponent(soql);

        try {
            const response = await this.sfetch(config, `/services/data/v58.0/query?q=${encodedQuery}`, {
                method: 'GET',
            });
            if (!response.ok) return null;
            const data = (await response.json()) as { records: Array<{ Id: string }> };
            return data.records?.[0]?.Id ?? null;
        } catch {
            return null;
        }
    }

    private parseFirstName(fullName?: string): string {
        if (!fullName) return 'Unknown';
        const parts = fullName.trim().split(/\s+/);
        return parts[0] || 'Unknown';
    }

    private parseLastName(fullName?: string): string {
        if (!fullName) return '';
        const parts = fullName.trim().split(/\s+/);
        return parts.slice(1).join(' ') || '';
    }
}
