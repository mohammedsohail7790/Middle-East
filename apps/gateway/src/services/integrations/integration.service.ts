import { Queue, Worker } from 'bullmq';
import { createHash } from 'crypto';
import type { Redis } from 'ioredis';
import { createRedisClient } from '../redis-connection.js';
import { CacheManager } from '../cache.js';
import { logger } from '../logger.js';
import { AiService } from '../voice/ai.service.js';
import { voiceMetrics } from '../voice/voice.metrics.js';
import {
    ServiceTitanProvider,
    JobberProvider,
    HouseCallProProvider,
    HubSpotProvider,
    SalesforceProvider,
    FreshsalesProvider,
    InsightlyProvider,
    PipedriveProvider,
} from './providers/index.js';

export interface IntegrationPayload {
    callId: string;
    type?: 'lead' | 'appointment' | 'reschedule';
    appointment?: {
        name?: string;
        phone?: string;
        service?: string;
        time?: string;
    };
    lead: {
        name?: string;
        phone?: string;
        email?: string;
        service?: string;
        preferred_time?: string;
        notes?: string;
    };
}

function makeRedisConnection(): Redis {
    if (!process.env.REDIS_URL) {
        throw new Error('REDIS_URL environment variable is not set');
    }
    return createRedisClient(undefined, { bullmq: true, label: 'bullmq' });
}

function parseIntegrationMetadata(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    return {};
}

export class IntegrationService {
    private _connection: Redis | null = null;

    private get connection(): Redis {
        if (!this._connection) {
            this._connection = makeRedisConnection();
        }
        return this._connection;
    }
    private queue = new Queue<IntegrationPayload>('voice-integrations', { connection: this.connection });
    private dlq = new Queue('voice-integrations-dlq', { connection: this.connection });
    private aiService = new AiService();
    private workerStarted = false;
    private cache = new CacheManager();
    
    // Integration providers
    private serviceTitanProvider = new ServiceTitanProvider();
    private jobberProvider = new JobberProvider();
    private houseCallProProvider = new HouseCallProProvider();
    private hubSpotProvider = new HubSpotProvider();
    private salesforceProvider = new SalesforceProvider();
    private freshsalesProvider = new FreshsalesProvider();
    private insightlyProvider = new InsightlyProvider();
    private pipedriveProvider = new PipedriveProvider();

    /** Called once at gateway boot so queued jobs from previous runs are processed immediately. */
    startWorkerOnBoot(): void {
        if (!this.workerStarted) {
            this.startWorker();
        }
    }

    /**
     * Dispatch integrations immediately (Zapier, CRMs) without waiting on the BullMQ worker drain.
     */
    async sendRealtime(tenantId: string, data: IntegrationPayload): Promise<void> {
        const { assertOperationalAccess } = await import('../billing/account-access.service.js');
        const access = await assertOperationalAccess(tenantId, 'integrations');
        if (!access.allowed) {
            logger.warn('Realtime integration dispatch blocked', { tenantId, reason: access.reason });
            return;
        }

        const idempotencyKey = this.getIdempotencyKey(
            tenantId,
            data.callId,
            data.lead,
            data.type,
            data.appointment?.time
        );
        const processedKey = `voice:integration:processed:${idempotencyKey}`;
        const alreadyProcessed = await this.cache.get<{ done: boolean }>(processedKey);
        if (alreadyProcessed?.done) {
            return;
        }

        try {
            await this.withTimeout(
                this.dispatch(tenantId, data.callId, data),
                Number(process.env.INTEGRATION_REALTIME_TIMEOUT_MS || 20000)
            );
            await this.cache.set(processedKey, { done: true }, { ttl: 60 * 60 * 24 * 30 });
        } catch (error) {
            logger.error('Realtime integration dispatch failed', {
                tenantId,
                callId: data.callId,
                error: String(error),
            });
            await this.send(tenantId, data);
        }
    }

    async send(tenantId: string, data: IntegrationPayload): Promise<void> {
        const { assertOperationalAccess } = await import('../billing/account-access.service.js');
        const access = await assertOperationalAccess(tenantId, 'integrations');
        if (!access.allowed) {
            logger.warn('Integration dispatch blocked', { tenantId, reason: access.reason });
            return;
        }

        const idempotencyKey = this.getIdempotencyKey(
            tenantId,
            data.callId,
            data.lead,
            data.type,
            data.appointment?.time
        );
        const dedupeKey = `voice:integration:dedupe:${idempotencyKey}`;
        const alreadyQueued = await this.cache.get<{ queued: boolean }>(dedupeKey);
        if (alreadyQueued?.queued) {
            logger.info('Skipping duplicate integration enqueue', { tenantId, callId: data.callId, idempotencyKey });
            return;
        }

        logger.info('Lead queued for delivery', {
            tenantId,
            callId: data.callId,
            provider: 'zapier',
            type: data.type || 'lead',
        });

        await this.queue.add(
            'dispatch',
            { ...data, tenantId, idempotencyKey } as IntegrationPayload & { tenantId: string; idempotencyKey: string },
            {
                jobId: idempotencyKey,
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: true,
                removeOnFail: 100,
            }
        );

        if (!this.workerStarted) {
            this.startWorker();
        }

        // Short cache write to reduce duplicate dispatch on reconnect edge cases.
        await this.cache.set(`voice:integration:${tenantId}:${data.callId}`, { queued: true }, { ttl: 120 });
        await this.cache.set(dedupeKey, { queued: true }, { ttl: 60 * 60 * 24 });
    }

    private startWorker(): void {
        this.workerStarted = true;
        new Worker(
            'voice-integrations',
            async (job) => {
                const { callId, tenantId, idempotencyKey } = job.data as IntegrationPayload & {
                    tenantId: string;
                    idempotencyKey: string;
                };
                const payload = job.data as IntegrationPayload & { tenantId: string; idempotencyKey: string };
                const processedKey = `voice:integration:processed:${idempotencyKey}`;
                const alreadyProcessed = await this.cache.get<{ done: boolean }>(processedKey);
                if (alreadyProcessed?.done) {
                    logger.info('Skipping previously processed integration job', { tenantId, callId, idempotencyKey });
                    return;
                }
                
                const { assertOperationalAccess } = await import('../billing/account-access.service.js');
                const access = await assertOperationalAccess(tenantId, 'integrations');
                if (!access.allowed) {
                    logger.warn('Integration job skipped — account locked', { tenantId, callId });
                    return;
                }

                logger.info('Processing lead delivery', {
                    tenantId,
                    callId,
                    attempt: job.attemptsMade + 1,
                    maxAttempts: 3,
                });

                await this.withTimeout(
                    this.dispatch(tenantId, callId, payload),
                    Number(process.env.INTEGRATION_JOB_TIMEOUT_MS || 15000)
                );
                await this.cache.set(processedKey, { done: true }, { ttl: 60 * 60 * 24 * 30 });
                
                logger.info('Lead delivery completed successfully', { tenantId, callId });
            },
            { connection: this.connection, drainDelay: Number(process.env.INTEGRATION_WORKER_DRAIN_MS || 250) }
        )
            .on('failed', (job, error) => {
                const tenantId = (job?.data as any)?.tenantId || 'unknown';
                const callId = (job?.data as any)?.callId || 'unknown';
                const attempt = job?.attemptsMade || 0;
                
                logger.error('Integration job failed', {
                    jobId: job?.id,
                    tenantId,
                    callId,
                    attempt,
                    error: String(error),
                    queue: 'voice-integrations',
                });
                
                voiceMetrics.integrationFailure(tenantId, 'multi', String(error));
                
                if (job) {
                    this.dlq
                        .add(
                            'dead-letter',
                            {
                                originalJobId: job.id,
                                payload: job.data,
                                failedAt: new Date().toISOString(),
                                reason: String(error),
                                attemptsMade: job.attemptsMade,
                            },
                            { removeOnComplete: true, removeOnFail: 1000 }
                        )
                        .then(() => {
                            logger.error('Lead delivery failed permanently, moved to DLQ', {
                                tenantId,
                                callId,
                                dlqJobId: job.id,
                            });
                        })
                        .catch((dlqError) => {
                            logger.error('Failed storing integration DLQ job', { error: String(dlqError) });
                        });
                }
            });
    }

    private async isPlanBlocked(tenantId: string, provider: string): Promise<boolean> {
        const { canDispatchIntegration } = await import('./integration-plan-access.js');
        return !(await canDispatchIntegration(tenantId, provider));
    }

    private async dispatch(tenantId: string, callId: string, payload: IntegrationPayload): Promise<void> {
        const { normalizeIntegrationPayload } = await import('./provider-lead-utils.js');
        payload = normalizeIntegrationPayload(payload);

        const { patchCorrelation } = await import('../observability/correlation-context.js');
        const { logQueueDispatch } = await import('../observability/validation-telemetry.js');
        patchCorrelation({ tenantId, callSid: callId });
        logQueueDispatch('job_start', {
            type: payload.type || 'lead',
            callId,
        });

        const config = await this.aiService.getTenantVoiceConfig(tenantId);
        const results: Array<{ provider: string; success: boolean; error?: string }> = [];

        // Test mode: log payload instead of sending
        if (process.env.TEST_INTEGRATION === 'true') {
            logger.info('TEST MODE - Lead payload (not sent)', {
                tenantId,
                callId,
                payload: {
                    source: 'call_iq',
                    tenantId,
                    callId,
                    type: payload.type || 'lead',
                    lead: payload.lead,
                    appointment: payload.appointment,
                    timestamp: new Date().toISOString(),
                },
            });
            return;
        }

        // Zapier integration (legacy/fallback)
        if (config.integrations.zapierWebhookUrl && !(await this.isPlanBlocked(tenantId, 'zapier'))) {
            try {
                logger.info('Sending lead to Zapier', { tenantId, callId, provider: 'zapier' });
                const response = await fetch(config.integrations.zapierWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: 'call_iq',
                        tenantId,
                        callId,
                        type: payload.type || 'lead',
                        lead: payload.lead,
                        appointment: payload.appointment,
                        provider: 'zapier',
                        timestamp: new Date().toISOString(),
                    }),
                });
                if (!response.ok) {
                    throw new Error(`Zapier webhook failed with status ${response.status}`);
                }
                logger.info('Lead sent successfully to Zapier', { tenantId, callId, provider: 'zapier' });
                results.push({ provider: 'zapier', success: true });
            } catch (error) {
                logger.error('Zapier webhook failed', {
                    tenantId,
                    callId,
                    error: String(error),
                    provider: 'zapier',
                });
                results.push({ provider: 'zapier', success: false, error: String(error) });
            }
        }

        // ServiceTitan integration
        await this.tryDispatchServiceTitan(tenantId, payload, results);

        // Jobber integration
        await this.tryDispatchJobber(tenantId, payload, results);

        // HouseCallPro integration
        await this.tryDispatchHouseCallPro(tenantId, payload, results);

        // HubSpot integration
        await this.tryDispatchHubSpot(tenantId, payload, results);

        // Salesforce integration
        await this.tryDispatchSalesforce(tenantId, payload, results);

        // Freshsales integration
        await this.tryDispatchFreshsales(tenantId, payload, results);

        // Insightly integration
        await this.tryDispatchInsightly(tenantId, payload, results);

        // Pipedrive integration
        await this.tryDispatchPipedrive(tenantId, payload, results);

        // Generic connection-store providers (Zoho, Copper, Follow Up Boss, etc.)
        await this.tryDispatchGenericProviders(tenantId, payload, results);

        // Custom webhook fallback
        await this.tryDispatchCustomWebhook(tenantId, payload, results);

        // Log summary
        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.filter((r) => !r.success).length;
        logger.info('Integration dispatch completed', {
            tenantId,
            callId,
            totalProviders: results.length,
            successful: successCount,
            failed: failureCount,
            results,
        });

        // Record sync timestamps for each provider so the Integrations page shows "Last synced"
        if (results.length > 0) {
            const { recordIntegrationSync } = await import('./integration-sync-state.js');
            const { publishIntegrationsUpdated } = await import('./integrations-notify.js');
            await Promise.allSettled(
                results.map((r) =>
                    recordIntegrationSync(tenantId, r.provider, r.success ? 1 : 0, r.error)
                )
            );
            for (const r of results) {
                publishIntegrationsUpdated(tenantId, r.provider);
            }
        }

        // Retry only when failures look transient (5xx, timeouts). 404/410 = stale webhook — do not retry.
        const permanent = (err?: string) =>
            !!err && /\b(404|410)\b/.test(err);
        const retryableFailures = results.filter((r) => !r.success && !permanent(r.error));
        if (results.length > 0 && failureCount === results.length && retryableFailures.length > 0) {
            throw new Error(`All ${results.length} integration(s) failed`);
        }
        if (failureCount > 0 && retryableFailures.length === 0) {
            logger.warn('Integration dispatch had only permanent failures (e.g. stale Zapier URL); call data unaffected', {
                tenantId,
                callId,
                results,
            });
        }
    }

    private async tryDispatchServiceTitan(
        tenantId: string,
        payload: IntegrationPayload,
        results: Array<{ provider: string; success: boolean; error?: string }>
    ): Promise<void> {
        try {
            if (await this.isPlanBlocked(tenantId, 'servicetitan')) return;
            const tenantConfig = await this.getTenantIntegrationConfig(tenantId);

            if (!tenantConfig.servicetitan_enabled) {
                return;
            }

            if (!tenantConfig.servicetitan_api_key || !tenantConfig.servicetitan_tenant_id || !tenantConfig.servicetitan_app_key) {
                logger.warn('ServiceTitan enabled but missing credentials', { tenantId });
                return;
            }

            logger.info('Sending lead to ServiceTitan', { tenantId, callId: payload.callId });
            await this.serviceTitanProvider.sendLead(
                {
                    apiKey: tenantConfig.servicetitan_api_key,
                    tenantId: tenantConfig.servicetitan_tenant_id,
                    clientId: tenantConfig.servicetitan_client_id || '',
                    clientSecret: tenantConfig.servicetitan_client_secret || '',
                    appKey: tenantConfig.servicetitan_app_key,
                    businessUnitId: tenantConfig.servicetitan_business_unit_id || undefined,
                    defaultJobTypeId: tenantConfig.servicetitan_default_job_type_id || undefined,
                },
                payload
            );
            results.push({ provider: 'servicetitan', success: true });
        } catch (error) {
            logger.error('ServiceTitan integration failed', {
                tenantId,
                callId: payload.callId,
                error: String(error),
            });
            results.push({ provider: 'servicetitan', success: false, error: String(error) });
        }
    }

    private async tryDispatchJobber(
        tenantId: string,
        payload: IntegrationPayload,
        results: Array<{ provider: string; success: boolean; error?: string }>
    ): Promise<void> {
        try {
            if (await this.isPlanBlocked(tenantId, 'jobber')) return;
            const tenantConfig = await this.getTenantIntegrationConfig(tenantId);

            if (!tenantConfig.jobber_enabled) {
                return;
            }

            if (!tenantConfig.jobber_api_token) {
                logger.warn('Jobber enabled but missing API token', { tenantId });
                return;
            }

            logger.info('Sending lead to Jobber', { tenantId, callId: payload.callId });
            await this.jobberProvider.sendLead(
                {
                    apiToken: tenantConfig.jobber_api_token,
                    accountId: tenantConfig.jobber_account_id || '',
                },
                payload
            );
            results.push({ provider: 'jobber', success: true });
        } catch (error) {
            logger.error('Jobber integration failed', {
                tenantId,
                callId: payload.callId,
                error: String(error),
            });
            results.push({ provider: 'jobber', success: false, error: String(error) });
        }
    }

    private async tryDispatchHouseCallPro(
        tenantId: string,
        payload: IntegrationPayload,
        results: Array<{ provider: string; success: boolean; error?: string }>
    ): Promise<void> {
        try {
            if (await this.isPlanBlocked(tenantId, 'housecallpro')) return;
            const tenantConfig = await this.getTenantIntegrationConfig(tenantId);

            if (!tenantConfig.housecallpro_enabled) {
                return;
            }

            if (!tenantConfig.housecallpro_api_key || !tenantConfig.housecallpro_company_id) {
                logger.warn('HouseCallPro enabled but missing credentials', { tenantId });
                return;
            }

            logger.info('Sending lead to HouseCallPro', { tenantId, callId: payload.callId });
            await this.houseCallProProvider.sendLead(
                {
                    apiKey: tenantConfig.housecallpro_api_key,
                    companyId: tenantConfig.housecallpro_company_id,
                },
                payload
            );
            results.push({ provider: 'housecallpro', success: true });
        } catch (error) {
            logger.error('HouseCallPro integration failed', {
                tenantId,
                callId: payload.callId,
                error: String(error),
            });
            results.push({ provider: 'housecallpro', success: false, error: String(error) });
        }
    }

    private async tryDispatchHubSpot(
        tenantId: string,
        payload: IntegrationPayload,
        results: Array<{ provider: string; success: boolean; error?: string }>
    ): Promise<void> {
        try {
            if (await this.isPlanBlocked(tenantId, 'hubspot')) return;
            const tenantConfig = await this.getTenantIntegrationConfig(tenantId);

            if (!tenantConfig.hubspot_enabled) {
                return;
            }

            const { resolveHubSpotAccessToken } = await import('./hubspot-token.service.js');
            const auth = await resolveHubSpotAccessToken(tenantId);
            if (!auth) {
                logger.warn('HubSpot enabled but missing credentials', { tenantId });
                return;
            }

            logger.info('Sending lead to HubSpot', { tenantId, callId: payload.callId });
            await this.hubSpotProvider.sendLead(
                {
                    apiKey: auth.accessToken,
                    portalId: auth.portalId,
                },
                payload
            );
            results.push({ provider: 'hubspot', success: true });
        } catch (error) {
            logger.error('HubSpot integration failed', {
                tenantId,
                callId: payload.callId,
                error: String(error),
            });
            results.push({ provider: 'hubspot', success: false, error: String(error) });
        }
    }

    private async tryDispatchSalesforce(
        tenantId: string,
        payload: IntegrationPayload,
        results: Array<{ provider: string; success: boolean; error?: string }>
    ): Promise<void> {
        try {
            if (await this.isPlanBlocked(tenantId, 'salesforce')) return;
            const tenantConfig = await this.getTenantIntegrationConfig(tenantId);

            if (!tenantConfig.salesforce_enabled) {
                return;
            }

            if (!tenantConfig.salesforce_access_token || !tenantConfig.salesforce_instance_url) {
                logger.warn('Salesforce enabled but missing credentials', { tenantId });
                return;
            }

            logger.info('Sending lead to Salesforce', { tenantId, callId: payload.callId });
            await this.salesforceProvider.sendLead(
                {
                    instanceUrl: tenantConfig.salesforce_instance_url,
                    accessToken: tenantConfig.salesforce_access_token,
                    refreshToken: tenantConfig.salesforce_refresh_token || undefined,
                    tenantId,
                },
                payload
            );
            results.push({ provider: 'salesforce', success: true });
        } catch (error) {
            logger.error('Salesforce integration failed', {
                tenantId,
                callId: payload.callId,
                error: String(error),
            });
            results.push({ provider: 'salesforce', success: false, error: String(error) });
        }
    }

    private async tryDispatchFreshsales(
        tenantId: string,
        payload: IntegrationPayload,
        results: Array<{ provider: string; success: boolean; error?: string }>
    ): Promise<void> {
        try {
            if (await this.isPlanBlocked(tenantId, 'freshsales')) return;
            const tenantConfig = await this.getTenantIntegrationConfig(tenantId);
            const meta = parseIntegrationMetadata(tenantConfig.metadata);
            const hasOAuth = !!meta.freshsales_access_token;
            const hasApiKey = !!meta.freshsales_api_key;
            if ((!hasOAuth && !hasApiKey) || !meta.freshsales_domain) return;
            await this.freshsalesProvider.sendLead(
                {
                    apiKey: hasApiKey ? String(meta.freshsales_api_key) : undefined,
                    accessToken: hasOAuth ? String(meta.freshsales_access_token) : undefined,
                    domain: String(meta.freshsales_domain),
                    orgDomain: meta.freshsales_org_domain ? String(meta.freshsales_org_domain) : undefined,
                    apiBaseUrl: meta.freshsales_api_base ? String(meta.freshsales_api_base) : undefined,
                },
                payload
            );
            results.push({ provider: 'freshsales', success: true });
        } catch (error) {
            logger.error('Freshsales integration failed', { tenantId, callId: payload.callId, error: String(error) });
            results.push({ provider: 'freshsales', success: false, error: String(error) });
        }
    }

    private async tryDispatchInsightly(
        tenantId: string,
        payload: IntegrationPayload,
        results: Array<{ provider: string; success: boolean; error?: string }>
    ): Promise<void> {
        try {
            if (await this.isPlanBlocked(tenantId, 'insightly')) return;
            const tenantConfig = await this.getTenantIntegrationConfig(tenantId);
            const meta = parseIntegrationMetadata(tenantConfig.metadata);
            if (!meta.insightly_api_key) return;
            await this.insightlyProvider.sendLead(
                {
                    apiKey: String(meta.insightly_api_key),
                    apiBaseUrl: meta.insightly_api_base_url ? String(meta.insightly_api_base_url) : undefined,
                },
                payload
            );
            results.push({ provider: 'insightly', success: true });
        } catch (error) {
            logger.error('Insightly integration failed', { tenantId, callId: payload.callId, error: String(error) });
            results.push({ provider: 'insightly', success: false, error: String(error) });
        }
    }

    private async tryDispatchPipedrive(
        tenantId: string,
        payload: IntegrationPayload,
        results: Array<{ provider: string; success: boolean; error?: string }>
    ): Promise<void> {
        try {
            if (await this.isPlanBlocked(tenantId, 'pipedrive')) return;
            const { resolvePipedriveAccessToken } = await import('./pipedrive-token.service.js');
            const creds = await resolvePipedriveAccessToken(tenantId);
            if (!creds) return;
            await this.pipedriveProvider.sendLead(
                {
                    accessToken: creds.accessToken,
                    apiDomain: creds.apiDomain,
                },
                payload
            );
            results.push({ provider: 'pipedrive', success: true });
        } catch (error) {
            logger.error('Pipedrive integration failed', { tenantId, callId: payload.callId, error: String(error) });
            results.push({ provider: 'pipedrive', success: false, error: String(error) });
        }
    }

    private async tryDispatchGenericProviders(
        tenantId: string,
        payload: IntegrationPayload,
        results: Array<{ provider: string; success: boolean; error?: string }>
    ): Promise<void> {
        const { connectionStore } = await import('./connection-store.service.js');
        const { getProviderAdapter, SYNC_CAPABLE_PROVIDER_KEYS } = await import('./provider-registry.js');

        for (const integrationId of SYNC_CAPABLE_PROVIDER_KEYS) {
            try {
                if (await this.isPlanBlocked(tenantId, integrationId)) continue;

                const connection = await connectionStore.getConnection(tenantId, integrationId);
                if (!connection || connection.status !== 'connected') continue;

                const credentials = await connectionStore.getDecryptedCredentials(tenantId, integrationId);
                if (!credentials) continue;

                const adapter = getProviderAdapter(integrationId);
                if (!adapter?.sendLead) continue;

                logger.info(`Sending lead to ${integrationId}`, { tenantId, callId: payload.callId });
                const jobId = await connectionStore.createSyncJob(tenantId, connection.id, integrationId, 'sync');
                try {
                    await adapter.sendLead(credentials, payload);
                    await connectionStore.markSynced(tenantId, integrationId, true);
                    await connectionStore.finishSyncJob(jobId, true);
                    results.push({ provider: integrationId, success: true });
                } catch (error) {
                    await connectionStore.markSynced(tenantId, integrationId, false, String(error));
                    await connectionStore.finishSyncJob(jobId, false, undefined, String(error));
                    throw error;
                }
            } catch (error) {
                logger.error(`${integrationId} integration failed`, {
                    tenantId,
                    callId: payload.callId,
                    error: String(error),
                });
                results.push({ provider: integrationId, success: false, error: String(error) });
            }
        }
    }

    private async tryDispatchCustomWebhook(
        tenantId: string,
        payload: IntegrationPayload,
        results: Array<{ provider: string; success: boolean; error?: string }>
    ): Promise<void> {
        try {
            const tenantConfig = await this.getTenantIntegrationConfig(tenantId);

            if (!tenantConfig.custom_webhook_url) {
                return;
            }

            logger.info('Sending lead to custom webhook', { tenantId, callId: payload.callId });
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...tenantConfig.custom_webhook_headers,
            };

            const response = await fetch(tenantConfig.custom_webhook_url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    source: 'call_iq',
                    tenantId,
                    callId: payload.callId,
                    type: payload.type || 'lead',
                    lead: payload.lead,
                    appointment: payload.appointment,
                    timestamp: new Date().toISOString(),
                }),
            });

            if (!response.ok) {
                throw new Error(`Custom webhook failed with status ${response.status}`);
            }

            results.push({ provider: 'custom_webhook', success: true });
        } catch (error) {
            logger.error('Custom webhook integration failed', {
                tenantId,
                callId: payload.callId,
                error: String(error),
            });
            results.push({ provider: 'custom_webhook', success: false, error: String(error) });
        }
    }

    private async getTenantIntegrationConfig(tenantId: string): Promise<any> {
        const cacheKey = `voice:tenant:integrations:${tenantId}`;
        const cached = await this.cache.get<any>(cacheKey);
        if (cached) return cached;

        const { voiceDb } = await import('../voice/tenant-scope.js');
        const result = await voiceDb.query(
            `
            select
                servicetitan_enabled, servicetitan_api_key, servicetitan_tenant_id,
                servicetitan_client_id, servicetitan_client_secret, servicetitan_app_key,
                coalesce((metadata->>'servicetitan_business_unit_id')::int, 0) as servicetitan_business_unit_id,
                coalesce((metadata->>'servicetitan_default_job_type_id')::int, 0) as servicetitan_default_job_type_id,
                jobber_enabled, jobber_api_token, jobber_account_id,
                housecallpro_enabled, housecallpro_api_key, housecallpro_company_id,
                salesforce_enabled, salesforce_instance_url, salesforce_access_token,
                salesforce_refresh_token,
                hubspot_enabled, hubspot_api_key, hubspot_portal_id,
                custom_webhook_url, custom_webhook_headers,
                metadata
            from public.voice_tenants
            where id = $1
            limit 1
        `,
            [tenantId]
        );

        if (!result.rows.length) {
            throw new Error(`Tenant integration config not found: ${tenantId}`);
        }

        const config = result.rows[0];
        // Cache for 5 minutes — short enough that a token refresh persisted to DB
        // will be picked up on the next dispatch cycle.
        await this.cache.set(cacheKey, config, { ttl: 300 });
        return config;
    }

    private getIdempotencyKey(tenantId: string, callId: string, lead: IntegrationPayload['lead'], type?: string, appointmentTime?: string): string {
        const raw = [
            tenantId,
            callId,
            type || 'lead',
            (lead.name || '').trim().toLowerCase(),
            (lead.phone || '').replace(/[^\d+]/g, ''),
            (lead.service || '').trim().toLowerCase(),
            appointmentTime || '',
        ].join('|');
        return createHash('sha256').update(raw).digest('hex');
    }

    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        let timeoutHandle: NodeJS.Timeout | null = null;
        try {
            return await Promise.race([
                promise,
                new Promise<T>((_, reject) => {
                    timeoutHandle = setTimeout(() => reject(new Error(`Integration dispatch timed out in ${timeoutMs}ms`)), timeoutMs);
                }),
            ]);
        } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
        }
    }

    async retryDeadLetterJob(jobId: string): Promise<boolean> {
        const job = await this.dlq.getJob(jobId);
        if (!job) return false;

        const payload = job.data?.payload as (IntegrationPayload & { tenantId?: string; idempotencyKey?: string }) | undefined;
        if (!payload?.tenantId || !payload?.callId || !payload?.lead) {
            return false;
        }

        const idempotencyKey =
            payload.idempotencyKey ||
            this.getIdempotencyKey(payload.tenantId, payload.callId, payload.lead, payload.type, payload.appointment?.time);
        const processedKey = `voice:integration:processed:${idempotencyKey}`;
        const alreadyProcessed = await this.cache.get<{ done: boolean }>(processedKey);
        if (alreadyProcessed?.done) {
            return true;
        }

        await this.queue.add(
            'dispatch',
            { ...payload, tenantId: payload.tenantId, idempotencyKey } as IntegrationPayload & {
                tenantId: string;
                idempotencyKey: string;
            },
            {
                jobId: `${idempotencyKey}:manual-retry:${Date.now()}`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: true,
                removeOnFail: 100,
            }
        );
        await job.remove();
        return true;
    }
}

export const integrationService = new IntegrationService();
