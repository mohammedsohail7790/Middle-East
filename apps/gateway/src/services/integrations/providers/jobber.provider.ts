import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';
import {
    getJobberApiVersion,
    jobberGraphqlRequest,
    jobberHttpErrorMessage,
} from './jobber-api.js';

export interface JobberConfig {
    apiToken: string;
    accountId: string;
}

/**
 * Jobber Integration Provider
 * Docs: https://developer.getjobber.com/docs/
 */
export class JobberProvider {
    private get apiVersion(): string {
        return getJobberApiVersion();
    }

    async verifyConnection(
        config: JobberConfig
    ): Promise<{ success: boolean; message: string; accountId?: string }> {
        try {
            const result = await jobberGraphqlRequest(config.apiToken, '{ account { id name } }');
            if (!result.ok) {
                return {
                    success: false,
                    message: jobberHttpErrorMessage(result.status, result.rawText),
                };
            }
            if (result.data?.errors?.length) {
                return {
                    success: false,
                    message: result.data.errors[0]?.message || 'Jobber authorization failed',
                };
            }
            const account = result.data?.data?.account as { id?: string; name?: string } | undefined;
            const accountId = account?.id;
            const accountName = account?.name;
            return {
                success: true,
                message: accountName
                    ? `Connected to Jobber (${accountName})`
                    : 'Connected to Jobber successfully',
                accountId: accountId || config.accountId || undefined,
            };
        } catch {
            return { success: false, message: 'Could not reach Jobber — try again in a moment.' };
        }
    }

    async sendTestLead(
        config: JobberConfig
    ): Promise<{ success: boolean; message: string; recordUrl?: string }> {
        try {
            await this.sendLead(config, {
                callId: `test-${Date.now()}`,
                type: 'lead',
                lead: {
                    name: 'Test Lead (Halla AI)',
                    phone: '+15551234567',
                    email: 'test-lead@calliq.example',
                    service: 'Connection test',
                    notes: 'This test lead was created by Halla AI to verify your Jobber connection.',
                },
            });
            return {
                success: true,
                message: 'Test lead sent to Jobber — check your clients and requests.',
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Jobber test lead failed',
            };
        }
    }

    async sendLead(config: JobberConfig, payload: IntegrationPayload): Promise<void> {
        const { lead } = payload;
        const scheduledTime = lead.preferred_time || payload.appointment?.time;

        const { clientId, isNew } = await this.findOrCreateClient(config, {
            firstName: this.parseFirstName(lead.name),
            lastName: this.parseLastName(lead.name),
            phoneNumber: lead.phone || '',
            email: lead.email || (lead.notes?.includes('@') ? lead.notes : undefined),
        });

        await this.createJobRequest(config, {
            clientId,
            title: `${lead.service || 'Service Request'} - ${scheduledTime || 'ASAP'}`,
            description: [
                `Service: ${lead.service || 'Not specified'}`,
                `Scheduled Time: ${scheduledTime || 'ASAP'}`,
                `Preferred Time: ${scheduledTime || 'ASAP'}`,
                `Notes: ${lead.notes || 'None'}`,
                `Source: Halla AI Voice AI`,
                `Call ID: ${payload.callId}`,
                payload.type === 'appointment' ? 'Halla AI booking: confirmed appointment' : '',
            ]
                .filter(Boolean)
                .join('\n'),
        });

        logger.info('Jobber lead delivered', {
            callId: payload.callId,
            clientId,
            isNewClient: isNew,
            service: lead.service,
            apiVersion: this.apiVersion,
        });
    }

    private async findOrCreateClient(
        config: JobberConfig,
        client: { firstName: string; lastName: string; phoneNumber: string; email?: string }
    ): Promise<{ clientId: string; isNew: boolean }> {
        if (client.phoneNumber) {
            const existingId = await this.findClientByPhone(config, client.phoneNumber);
            if (existingId) {
                return { clientId: existingId, isNew: false };
            }
        }
        const clientId = await this.createClient(config, client);
        return { clientId, isNew: true };
    }

    private async findClientByPhone(config: JobberConfig, phone: string): Promise<string | null> {
        const normalizedPhone = phone.replace(/[^\d+]/g, '');
        const query = `
            query FindClientByPhone($phone: String!) {
                clients(filter: { phones: { number: $phone } }, first: 1) {
                    nodes { id }
                }
            }
        `;
        try {
            const result = await jobberGraphqlRequest(config.apiToken, query, { phone: normalizedPhone });
            if (!result.ok || result.data?.errors?.length) return null;
            const nodes = (result.data?.data?.clients as { nodes?: Array<{ id?: string }> } | undefined)?.nodes;
            return nodes?.[0]?.id ?? null;
        } catch {
            return null;
        }
    }

    private async createClient(
        config: JobberConfig,
        client: { firstName: string; lastName: string; phoneNumber: string; email?: string }
    ): Promise<string> {
        const mutation = `
            mutation CreateClient($input: ClientCreateInput!) {
                clientCreate(input: $input) {
                    client { id name jobberWebUri }
                    userErrors { message path }
                }
            }
        `;

        const clientInput: Record<string, unknown> = {
            firstName: client.firstName,
            lastName: client.lastName,
        };
        if (client.phoneNumber) {
            clientInput.phones = [{ number: client.phoneNumber, primary: true, description: 'MAIN' }];
        }
        if (client.email) {
            clientInput.emails = [{ address: client.email, primary: true, description: 'MAIN' }];
        }

        const result = await jobberGraphqlRequest(config.apiToken, mutation, { input: clientInput });
        if (!result.ok) {
            throw new Error(jobberHttpErrorMessage(result.status, result.rawText));
        }

        const payload = result.data?.data?.clientCreate as
            | { client?: { id?: string }; userErrors?: Array<{ message?: string }> }
            | undefined;
        if (result.data?.errors?.length || payload?.userErrors?.length) {
            const errorMsg = result.data?.errors?.[0]?.message || payload?.userErrors?.[0]?.message;
            throw new Error(`Jobber client creation failed: ${errorMsg}`);
        }

        const clientId = payload?.client?.id;
        if (!clientId) throw new Error('Jobber client creation failed: no client id returned');
        return clientId;
    }

    private async createJobRequest(
        config: JobberConfig,
        request: { clientId: string; title: string; description: string }
    ): Promise<string> {
        const mutation = `
            mutation CreateRequest($input: RequestCreateInput!) {
                requestCreate(input: $input) {
                    request { id jobberWebUri }
                    userErrors { message path }
                }
            }
        `;

        const result = await jobberGraphqlRequest(config.apiToken, mutation, {
            input: {
                clientId: request.clientId,
                title: request.description
                    ? `${request.title} — ${request.description.slice(0, 240)}`
                    : request.title,
            },
        });
        if (!result.ok) {
            throw new Error(jobberHttpErrorMessage(result.status, result.rawText));
        }

        const payload = result.data?.data?.requestCreate as
            | { request?: { id?: string }; userErrors?: Array<{ message?: string }> }
            | undefined;
        if (result.data?.errors?.length || payload?.userErrors?.length) {
            const errorMsg = result.data?.errors?.[0]?.message || payload?.userErrors?.[0]?.message;
            throw new Error(`Jobber request creation failed: ${errorMsg}`);
        }

        const requestId = payload?.request?.id;
        if (!requestId) throw new Error('Jobber request creation failed: no request id returned');
        return requestId;
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
