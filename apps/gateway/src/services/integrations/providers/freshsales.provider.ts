import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';

export interface FreshsalesConfig {
    /** Legacy API key (api_credentials flow) */
    apiKey?: string;
    /** OAuth access token */
    accessToken?: string;
    /** Subdomain only, e.g. "acme" from acme.freshsales.io */
    domain: string;
    /** Full Freshworks org host, e.g. acme.myfreshworks.com */
    orgDomain?: string;
    /** Explicit API base when known from OAuth (myfreshworks vs freshsales.io) */
    apiBaseUrl?: string;
}

function normalizeDomain(domain: string): string {
    let d = domain.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '');
    d = d.replace(/\.freshsales\.io\/?.*$/, '');
    d = d.replace(/\.myfreshworks\.com\/?.*$/, '');
    d = d.replace(/[^a-z0-9-]/g, '');
    return d;
}

/** Normalize user input to a Freshworks org host for OAuth (org/oauth/v2/*). */
export function normalizeFreshworksOrgDomain(input: string): string {
    let d = input.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (d.includes('myfreshworks.com')) {
        return d.split('/')[0] || d;
    }
    if (d.includes('.freshsales.io')) {
        const sub = d.replace(/\.freshsales\.io.*$/, '');
        return `${sub}.myfreshworks.com`;
    }
    if (!d.includes('.')) {
        return `${d}.myfreshworks.com`;
    }
    return d;
}

export function freshsalesApiBaseUrl(config: FreshsalesConfig): string {
  if (config.apiBaseUrl?.trim()) {
    return config.apiBaseUrl.replace(/\/$/, '');
  }
  const org = (config.orgDomain || '').trim().toLowerCase();
  if (org.includes('myfreshworks.com')) {
    const host = org.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return `https://${host}/crm/sales/api`;
  }
  const domainInput = (config.domain || '').trim().toLowerCase();
  if (domainInput.includes('myfreshworks.com')) {
    const host = domainInput.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return `https://${host}/crm/sales/api`;
  }
  const sub = normalizeDomain(config.domain || config.orgDomain || '');
  if (!sub) throw new Error('Freshsales domain is required');
  return `https://${sub}.freshsales.io/api`;
}

export function isFreshsalesSuiteApi(config: FreshsalesConfig): boolean {
  return freshsalesApiBaseUrl(config).includes('/crm/sales/api');
}

function usesSuiteContactsApi(config: FreshsalesConfig): boolean {
  return isFreshsalesSuiteApi(config) && !!(config.accessToken?.trim() || config.apiKey?.trim());
}

export function freshsalesVerifyUrls(config: FreshsalesConfig): string[] {
  const base = freshsalesApiBaseUrl(config);
  if (isFreshsalesSuiteApi(config)) {
    return [
      `${base}/selectors/owners`,
      `${base}/selector/owners`,
      `${base}/contacts/filters`,
    ];
  }
  return [`${base}/selector/owners`];
}

/** Primary health-check path (first verify URL). */
export function freshsalesHealthCheckUrl(config: FreshsalesConfig): string {
  return freshsalesVerifyUrls(config)[0] || `${freshsalesApiBaseUrl(config)}/selector/owners`;
}

export function freshsalesCreateRecordUrl(config: FreshsalesConfig): string {
  const base = freshsalesApiBaseUrl(config);
  return usesSuiteContactsApi(config) ? `${base}/contacts` : `${base}/leads`;
}

export function freshsalesUpsertRecordUrl(config: FreshsalesConfig): string {
  return `${freshsalesApiBaseUrl(config)}/contacts/upsert`;
}

export function freshsalesOAuthAuthorizeUrl(
  orgDomain: string,
  query: { clientId: string; redirectUri: string; state: string; scope: string }
): string {
  const params = new URLSearchParams({
    client_id: query.clientId,
    redirect_uri: query.redirectUri,
    response_type: 'code',
    state: query.state,
    scope: query.scope,
  });
  return `https://${orgDomain}/org/oauth/v2/authorize?${params.toString()}`;
}

export function freshsalesOAuthTokenUrls(orgDomain: string): string[] {
  return [
    `https://${orgDomain}/org/oauth/v2/token`,
    `https://${orgDomain}/oauth/v2/token`,
  ];
}

function freshsalesRecordUrl(config: FreshsalesConfig, id: number, kind: 'contact' | 'lead'): string {
    const org = (config.orgDomain || '').trim().toLowerCase();
    if (org.includes('myfreshworks.com')) {
        const host = org.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const segment = kind === 'contact' ? 'contacts' : 'leads';
        return `https://${host}/crm/sales/${segment}/${id}`;
    }
    const sub = normalizeDomain(config.domain);
    return `https://${sub}.freshsales.io/${kind === 'contact' ? 'contacts' : 'leads'}/${id}`;
}

function resolveToken(config: FreshsalesConfig): string {
    const token = (config.accessToken || config.apiKey || '').trim();
    if (!token) throw new Error('Freshsales credentials are missing');
    return token;
}

/** Freshworks OAuth token_type is "Token" — use Token token= for Suite OAuth and API keys. */
function authHeaderVariants(config: FreshsalesConfig): string[] {
    const token = resolveToken(config);
    if (isFreshsalesSuiteApi(config)) {
        return [`Token token=${token}`, `Bearer ${token}`];
    }
    return [`Token token=${token}`];
}

function authHeaders(config: FreshsalesConfig, authorization: string): Record<string, string> {
    return {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
}

async function fetchWithAuth(
    config: FreshsalesConfig,
    url: string,
    init?: RequestInit
): Promise<Response> {
    const variants = authHeaderVariants(config);
    let lastResponse: Response | null = null;
    for (const authorization of variants) {
        const response = await fetch(url, {
            ...init,
            headers: {
                ...authHeaders(config, authorization),
                ...(init?.headers as Record<string, string> | undefined),
            },
        });
        lastResponse = response;
        const status = (response as unknown as { status: number }).status;
        if (response.ok || (status !== 401 && status !== 403)) {
            return response;
        }
    }
    return lastResponse as Response;
}

function parseContactId(data: unknown): number | undefined {
    const payload = data as { contact?: { id?: number }; id?: number };
    return payload.contact?.id ?? payload.id;
}

function parseLeadId(data: unknown): number | undefined {
    const payload = data as { lead?: { id?: number } };
    return payload.lead?.id;
}

export class FreshsalesProvider {
    async verifyConnection(config: FreshsalesConfig): Promise<{ success: boolean; message: string }> {
        try {
            let lastStatus = 0;
            for (const url of freshsalesVerifyUrls(config)) {
                const response = await fetchWithAuth(config, url);
                lastStatus = (response as unknown as { status: number }).status;
                if (response.ok) {
                    return { success: true, message: 'Connected to Freshsales successfully' };
                }
            }

            if (lastStatus === 401 || lastStatus === 403) {
                return {
                    success: false,
                    message: config.accessToken
                        ? 'Freshworks external OAuth tokens often cannot access the CRM API — use API key connect instead (Profile → API Settings in Freshsales).'
                        : 'Invalid API key — open Freshsales → your profile → Settings → API Settings and copy the full key.',
                };
            }
            if (lastStatus === 404) {
                return {
                    success: false,
                    message:
                        'Freshsales domain not found — use your full org URL from the browser after login (e.g. acme.myfreshworks.com).',
                };
            }
            return { success: false, message: `Could not reach Freshsales (HTTP ${lastStatus})` };
        } catch {
            return {
                success: false,
                message: 'Could not reach Freshsales — check your domain and try again.',
            };
        }
    }

    async sendTestLead(config: FreshsalesConfig): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        return this.createRecord(config, {
            callId: `test-${Date.now()}`,
            type: 'lead',
            lead: {
                name: 'Test Lead (Halla AI)',
                phone: '+15551234567',
                email: `test-${Date.now()}@calliq.example`,
                service: 'Connection test',
                notes: 'Created by Halla AI to verify your Freshsales connection.',
            },
        });
    }

    async sendLead(config: FreshsalesConfig, payload: IntegrationPayload): Promise<void> {
        const result = await this.createRecord(config, payload);
        if (!result.success) {
            throw new Error(result.message);
        }
        logger.info('Freshsales record delivered', { callId: payload.callId, recordUrl: result.recordUrl });
    }

    private async createRecord(
        config: FreshsalesConfig,
        payload: IntegrationPayload
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const { lead } = payload;
        const parts = (lead.name || 'Customer').trim().split(/\s+/);
        const firstName = parts[0] || 'Customer';
        const lastName = parts.slice(1).join(' ') || 'Call';
        const useContacts = usesSuiteContactsApi(config);
        const email = lead.email?.trim() || undefined;
        const phone = lead.phone?.trim() || undefined;

        if (useContacts) {
            return this.createSuiteContact(config, {
                firstName,
                lastName,
                email,
                phone,
                callId: payload.callId,
            });
        }

        const notes = lead.notes || `Service: ${lead.service || 'N/A'}`;
        const body = {
            lead: {
                first_name: firstName,
                last_name: lastName,
                mobile_number: phone,
                email,
                company: { name: lead.service || 'Halla AI Lead' },
                custom_field: { cf_notes: notes },
            },
        };

        const response = await fetchWithAuth(config, freshsalesCreateRecordUrl(config), {
            method: 'POST',
            body: JSON.stringify(body),
        });
        return this.parseCreateResponse(config, response, 'lead');
    }

    private async createSuiteContact(
        config: FreshsalesConfig,
        input: {
            firstName: string;
            lastName: string;
            email?: string;
            phone?: string;
            callId: string;
        }
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const contactPayload = {
            first_name: input.firstName,
            last_name: input.lastName,
            ...(input.phone ? { mobile_number: input.phone } : {}),
            ...(input.email ? { email: input.email } : {}),
        };

        const uniqueEmail = input.email || `call-${input.callId}@calliq.example`;
        const upsertBody = {
            unique_identifier: { emails: uniqueEmail },
            contact: contactPayload,
        };

        const upsertResponse = await fetchWithAuth(config, freshsalesUpsertRecordUrl(config), {
            method: 'POST',
            body: JSON.stringify(upsertBody),
        });
        if (upsertResponse.ok) {
            const data = await upsertResponse.json();
            const id = parseContactId(data);
            return {
                success: true,
                message: 'Contact successfully created in Freshsales',
                recordUrl: id ? freshsalesRecordUrl(config, id, 'contact') : undefined,
            };
        }

        const createBody = { contact: contactPayload };
        const createResponse = await fetchWithAuth(config, freshsalesCreateRecordUrl(config), {
            method: 'POST',
            body: JSON.stringify(createBody),
        });
        return this.parseCreateResponse(config, createResponse, 'contact');
    }

    private async parseCreateResponse(
        config: FreshsalesConfig,
        response: Response,
        kind: 'contact' | 'lead'
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        const status = (response as unknown as { status: number }).status;
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            if (status === 401 || status === 403 || /unauthorized|invalid|login.*failed/i.test(text)) {
                return {
                    success: false,
                    message:
                        'Freshsales rejected write access — reconnect and approve contacts.create and contacts.upsert in Freshworks Developer Portal.',
                };
            }
            return {
                success: false,
                message: `Could not create ${kind} in Freshsales (HTTP ${status})`,
            };
        }

        const data = await response.json();
        const id = kind === 'contact' ? parseContactId(data) : parseLeadId(data);
        return {
            success: true,
            message:
                kind === 'contact'
                    ? 'Contact successfully created in Freshsales'
                    : 'Lead successfully created in Freshsales',
            recordUrl: id ? freshsalesRecordUrl(config, id, kind) : undefined,
        };
    }
}

export function normalizeFreshsalesDomain(domain: string): string {
    return normalizeDomain(domain);
}
