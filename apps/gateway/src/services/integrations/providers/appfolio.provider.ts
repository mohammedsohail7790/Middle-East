import { logger } from '../../logger.js';
import type { IntegrationPayload } from '../integration.service.js';
import { leadNotes, splitLeadName } from '../provider-lead-utils.js';

export interface AppFolioConfig {
    /** Company subdomain, e.g. acme from acme.appfolio.com */
    apiDomain: string;
    clientId: string;
    clientSecret: string;
}

function normalizeDomain(domain: string): string {
    let d = domain.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '');
    d = d.replace(/\.appfolio\.com\/?.*$/, '');
    d = d.replace(/[^a-z0-9-]/g, '');
    return d;
}

function baseUrl(config: AppFolioConfig): string {
    const sub = normalizeDomain(config.apiDomain);
    if (!sub) throw new Error('AppFolio company login name is required');
    return `https://${sub}.appfolio.com/api/v1`;
}

function basicAuth(config: AppFolioConfig): string {
    return Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
}

function authHeaders(config: AppFolioConfig): Record<string, string> {
    return {
        Authorization: `Basic ${basicAuth(config)}`,
        'Content-Type': 'application/json',
    };
}

export class AppFolioProvider {
    async verifyConnection(config: AppFolioConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${baseUrl(config)}/properties?per_page=1`, {
                headers: authHeaders(config),
            });
            const status = (response as unknown as { status: number }).status;
            if (response.ok) return { success: true, message: 'Connected to AppFolio successfully' };
            if (status === 401 || status === 403) {
                return { success: false, message: 'AppFolio rejected those credentials — check your company name, Client ID, and secret.' };
            }
            if (status === 404) {
                return { success: false, message: 'Company not found — enter only your AppFolio login name (e.g. acme from acme.appfolio.com).' };
            }
            return { success: false, message: `Could not reach AppFolio (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach AppFolio — check your credentials and try again.' };
        }
    }

    async sendTest(config: AppFolioConfig): Promise<{ success: boolean; message: string }> {
        return this.createLead(config, {
            callId: `test-${Date.now()}`,
            type: 'lead',
            lead: {
                name: 'Test Lead (Call IQ)',
                phone: '+15551234567',
                email: 'test-lead@calliq.example',
                service: 'Connection test',
                notes: 'This test lead was created by Call IQ to verify your AppFolio connection.',
            },
        });
    }

    async sendLead(config: AppFolioConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.createLead(config, payload);
        if (!result.success) throw new Error(result.message);
        logger.info('AppFolio lead delivered', { callId: payload.callId, recordUrl: result.recordUrl });
    }

    private async createLead(
        config: AppFolioConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const { lead } = payload;
        const { first, last } = splitLeadName(lead.name);
        const body = {
            first_name: first,
            last_name: last,
            email: lead.email || undefined,
            phone: lead.phone || undefined,
            notes: leadNotes(payload),
            source: 'Call IQ',
        };

        try {
            const response = await fetch(`${baseUrl(config)}/leads`, {
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
                            ? 'AppFolio rejected those credentials — check your company name, Client ID, and secret.'
                            : `Could not create lead in AppFolio (HTTP ${status})`,
                };
            }
            const data = (await response.json()) as { id?: string };
            return {
                success: true,
                message: 'Lead successfully created in AppFolio',
                recordUrl: data.id ? `https://${normalizeDomain(config.apiDomain)}.appfolio.com/leads/${data.id}` : undefined,
            };
        } catch {
            return { success: false, message: 'Could not reach AppFolio — check your credentials and try again.' };
        }
    }
}
