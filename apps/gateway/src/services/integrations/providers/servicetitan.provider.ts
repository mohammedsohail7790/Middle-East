import { logger } from '../../logger.js';
import { IntegrationPayload } from '../integration.service.js';

export interface ServiceTitanConfig {
    apiKey: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
    appKey: string;
    /** Optional per-tenant business unit ID override stored in metadata */
    businessUnitId?: number;
    /** Optional per-tenant job type ID override */
    defaultJobTypeId?: number;
}

export interface ServiceTitanJobRequest {
    customerId: number;
    jobTypeId: number;
    businessUnitId: number;
    priority: string;
    summary: string;
    customFields?: Record<string, any>;
}

/**
 * ServiceTitan Integration Provider
 * Docs: https://developer.servicetitan.io/
 *
 * Fixes:
 *  - businessUnitId and jobTypeId are now resolved from tenant config/account instead
 *    of being hardcoded to 1. Falls back to the first available unit/type.
 *  - Duplicate customer prevention via phone-number lookup before create.
 */
export class ServiceTitanProvider {
    private baseUrl = 'https://api.servicetitan.io';

    async sendLead(config: ServiceTitanConfig, payload: IntegrationPayload): Promise<void> {
        const { lead } = payload;

        // Step 1: Resolve business unit and job type from the account (not hardcoded)
        const [businessUnitId, jobTypeId] = await Promise.all([
            this.resolveBusinessUnitId(config),
            this.resolveJobTypeId(config, lead.service),
        ]);

        // Step 2: Find or create customer (duplicate prevention)
        const customerId = await this.findOrCreateCustomer(config, {
            name: lead.name || 'Unknown',
            phoneNumber: lead.phone || '',
            email: lead.notes?.includes('@') ? lead.notes : undefined,
        });

        // Step 3: Create job
        await this.createJob(config, {
            customerId,
            jobTypeId,
            businessUnitId,
            priority: 'Normal',
            summary: `${lead.service || 'Service Request'} - ${lead.name || 'Customer'} - ${lead.preferred_time || 'ASAP'}`,
            customFields: {
                source: 'Call IQ Voice AI',
                callId: payload.callId,
                preferredTime: lead.preferred_time,
                notes: lead.notes,
            },
        });

        logger.info('ServiceTitan lead delivered', {
            callId: payload.callId,
            customerId,
            businessUnitId,
            jobTypeId,
            service: lead.service,
        });
    }

    /**
     * Fetch the first available business unit from the tenant's account.
     * Uses config override if provided, so tenants can pin a specific unit.
     */
    private async resolveBusinessUnitId(config: ServiceTitanConfig): Promise<number> {
        // Use tenant-specific override if configured
        if (config.businessUnitId && config.businessUnitId > 0) {
            return config.businessUnitId;
        }

        try {
            const response = await fetch(
                `${this.baseUrl}/settings/v2/tenant/${config.tenantId}/business-units?pageSize=1&active=true`,
                {
                    headers: {
                        Authorization: `Bearer ${config.apiKey}`,
                        'ST-App-Key': config.appKey,
                    },
                }
            );
            if (response.ok) {
                const data = (await response.json()) as { data: Array<{ id: number }> };
                if (data.data?.[0]?.id) {
                    return data.data[0].id;
                }
            }
        } catch (err) {
            logger.warn('ServiceTitan business unit lookup failed, using fallback', {
                tenantId: config.tenantId,
                error: String(err),
            });
        }

        // If the API call fails or returns no results, throw — we cannot safely assume unit 1
        throw new Error(
            'ServiceTitan: No business unit found. Configure servicetitan_business_unit_id in tenant settings.'
        );
    }

    /**
     * Map the caller's service description to a job type ID.
     * Fetches from the account to avoid hardcoded IDs.
     */
    private async resolveJobTypeId(config: ServiceTitanConfig, service?: string): Promise<number> {
        // Use tenant-specific override if configured
        if (config.defaultJobTypeId && config.defaultJobTypeId > 0) {
            return config.defaultJobTypeId;
        }

        try {
            const response = await fetch(
                `${this.baseUrl}/jpm/v2/tenant/${config.tenantId}/job-types?pageSize=50&active=true`,
                {
                    headers: {
                        Authorization: `Bearer ${config.apiKey}`,
                        'ST-App-Key': config.appKey,
                    },
                }
            );
            if (response.ok) {
                const data = (await response.json()) as { data: Array<{ id: number; name: string }> };
                const types = data.data ?? [];

                if (service && types.length > 0) {
                    const normalizedService = service.toLowerCase();
                    // Find best match by name similarity
                    const match = types.find(
                        (t) => t.name.toLowerCase().includes(normalizedService) ||
                               normalizedService.includes(t.name.toLowerCase())
                    );
                    if (match) return match.id;
                }

                // Fall back to first available job type
                if (types[0]?.id) return types[0].id;
            }
        } catch (err) {
            logger.warn('ServiceTitan job type lookup failed', {
                tenantId: config.tenantId,
                service,
                error: String(err),
            });
        }

        throw new Error(
            'ServiceTitan: No job type found. Configure servicetitan_default_job_type_id in tenant settings.'
        );
    }

    /**
     * Look up customer by phone before creating to prevent duplicates.
     */
    private async findOrCreateCustomer(
        config: ServiceTitanConfig,
        customer: { name: string; phoneNumber: string; email?: string }
    ): Promise<number> {
        if (customer.phoneNumber) {
            const existingId = await this.findCustomerByPhone(config, customer.phoneNumber);
            if (existingId) {
                logger.info('ServiceTitan reusing existing customer', {
                    tenantId: config.tenantId,
                    customerId: existingId,
                });
                return existingId;
            }
        }
        return this.createCustomer(config, customer);
    }

    private async findCustomerByPhone(config: ServiceTitanConfig, phone: string): Promise<number | null> {
        const normalizedPhone = phone.replace(/[^\d+]/g, '');
        try {
            const response = await fetch(
                `${this.baseUrl}/crm/v2/tenant/${config.tenantId}/customers?phone=${encodeURIComponent(normalizedPhone)}&pageSize=1`,
                {
                    headers: {
                        Authorization: `Bearer ${config.apiKey}`,
                        'ST-App-Key': config.appKey,
                    },
                }
            );
            if (!response.ok) return null;
            const data = (await response.json()) as { data: Array<{ id: number }> };
            return data.data?.[0]?.id ?? null;
        } catch {
            return null;
        }
    }

    private async createCustomer(
        config: ServiceTitanConfig,
        customer: { name: string; phoneNumber: string; email?: string }
    ): Promise<number> {
        const response = await fetch(`${this.baseUrl}/crm/v2/tenant/${config.tenantId}/customers`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'ST-App-Key': config.appKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: customer.name,
                type: 'Residential',
                contacts: [
                    { type: 'Phone', value: customer.phoneNumber },
                    ...(customer.email ? [{ type: 'Email', value: customer.email }] : []),
                ],
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`ServiceTitan customer creation failed (${response.status}): ${error}`);
        }

        const result = (await response.json()) as { id: number };
        return Number(result.id);
    }

    private async createJob(config: ServiceTitanConfig, job: ServiceTitanJobRequest): Promise<number> {
        const response = await fetch(`${this.baseUrl}/jpm/v2/tenant/${config.tenantId}/jobs`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'ST-App-Key': config.appKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(job),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`ServiceTitan job creation failed (${response.status}): ${error}`);
        }

        const result = (await response.json()) as { id: number };
        return Number(result.id);
    }
}
