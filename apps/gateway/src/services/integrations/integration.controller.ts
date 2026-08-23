import { logger } from '../logger.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { publishIntegrationsUpdated } from './integrations-notify.js';
import express from 'express';
import {
    ServiceTitanProvider,
    JobberProvider,
    HouseCallProProvider,
    SalesforceProvider,
    HubSpotProvider,
    FreshsalesProvider,
    InsightlyProvider,
    PipedriveProvider,
    normalizeFreshsalesDomain,
    normalizeFreshworksOrgDomain,
} from './providers/index.js';
import { loadIntegrationSyncTimes } from './integration-sync-state.js';
import { integrationSyncService } from './integration-sync.service.js';
import { clientErrorMessage } from '../../security/safe-error.js';
import { getIntegrationCatalogEntry, GENERIC_CONNECTION_PROVIDERS } from './integration-catalog.js';
import { connectionStore } from './connection-store.service.js';
import { getProviderAdapter } from './provider-registry.js';
import { assertIntegrationPlanAccess } from './integration-plan-access.js';
import {
    LEGACY_TEST_ON_CONFIGURE,
    trimCredentialFields,
} from './credential-utils.js';
import { parseCopperConfig } from './providers/copper.provider.js';
import { zohoAccountsHost } from './providers/zoho.provider.js';
import { type CallIqAuthenticatedRequest } from '../auth/tenant-context.js';
import { resolveUserRole, requirePermission } from '../enterprise/rbac.service.js';

function getTenantId(req: any): string {
    const tenantId = (req as any).resolvedTenantId || req.header('x-tenant-id');
    if (!tenantId) throw new Error('x-tenant-id header is required');
    return tenantId;
}

/** OAuth tokens for Pipedrive live in voice_tenants.metadata (no dedicated columns). */
function parseTenantMetadata(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    return {};
}

function enrichRowWithMetadataFields(row: Record<string, unknown>): Record<string, unknown> {
    const meta = parseTenantMetadata(row.metadata);
    return {
        ...row,
        pipedrive_access_token: meta.pipedrive_access_token,
        pipedrive_enabled: meta.pipedrive_enabled === true || !!meta.pipedrive_access_token,
        freshsales_api_key: meta.freshsales_api_key,
        freshsales_access_token: meta.freshsales_access_token,
        freshsales_domain: meta.freshsales_domain,
        freshsales_org_domain: meta.freshsales_org_domain,
        freshsales_enabled:
            meta.freshsales_enabled === true ||
            !!meta.freshsales_access_token ||
            !!meta.freshsales_api_key,
        insightly_api_key: meta.insightly_api_key,
        insightly_enabled: meta.insightly_enabled === true || !!meta.insightly_api_key,
    };
}

async function mergeTenantMetadata(tenantId: string, patch: Record<string, unknown>): Promise<void> {
    await voiceDb.query(
        `update public.voice_tenants
         set metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb, updated_at = now()
         where id = $1`,
        [tenantId, JSON.stringify(patch)]
    );
}

function isCalendarRowActive(cal: {
    access_token?: string | null;
    refresh_token?: string | null;
    status?: string | null;
}): boolean {
    const hasToken = !!(cal.access_token || cal.refresh_token);
    const status = cal.status ?? 'active';
    return hasToken && status === 'active';
}

async function isGoogleCalendarConnected(tenantId: string, flags: Record<string, unknown> | null): Promise<boolean> {
    if (flags?.google_refresh_token || flags?.google_access_token) {
        return true;
    }
    try {
        const calendars = await voiceDb.query(
            `select 1 from public.calendar_connections
             where tenant_id = $1 and provider = 'google'
               and (access_token is not null or refresh_token is not null)
               and coalesce(status, 'active') = 'active'
             limit 1`,
            [tenantId]
        );
        return calendars.rows.length > 0;
    } catch {
        return false;
    }
}

/** Read integration flags from voice_tenants (avoids broken integration_status table/view drift). */
async function loadTenantIntegrationFlags(
    tenantId: string
): Promise<Record<string, unknown> | null> {
    const result = await voiceDb.query(
        `select google_refresh_token, google_access_token, metadata,
                zapier_webhook_url, hubspot_api_key, salesforce_access_token,
                servicetitan_api_key, jobber_api_token, housecallpro_api_key
         from public.voice_tenants where id = $1 limit 1`,
        [tenantId]
    );
    if (!result.rows.length) {
        return null;
    }
    const v = enrichRowWithMetadataFields(result.rows[0]);
    return {
        zapier_connected: !!v.zapier_webhook_url,
        hubspot_connected: !!v.hubspot_api_key,
        salesforce_connected: !!v.salesforce_access_token,
        servicetitan_connected: !!v.servicetitan_api_key,
        jobber_connected: !!v.jobber_api_token,
        housecallpro_connected: !!v.housecallpro_api_key,
        google_refresh_token: v.google_refresh_token,
        google_access_token: v.google_access_token,
        pipedrive_access_token: v.pipedrive_access_token,
        pipedrive_enabled: v.pipedrive_enabled,
        freshsales_connected:
            !!v.freshsales_access_token || !!v.freshsales_api_key || v.freshsales_enabled === true,
        insightly_connected: !!v.insightly_api_key,
    };
}

async function logAuditEvent(
    tenantId: string,
    provider: string,
    action: string,
    metadata: Record<string, any> = {},
    req?: Request
) {
    try {
        await voiceDb.query(
            `insert into public.integration_audit_log (tenant_id, provider, action, metadata, ip_address, user_agent)
             values ($1, $2, $3, $4, $5, $6)`,
            [
                tenantId,
                provider,
                action,
                JSON.stringify(metadata),
                req?.ip || null,
                req?.get('user-agent') || null,
            ]
        );
    } catch (error) {
        logger.error('Failed to log audit event', { error: String(error) });
    }
}

export function createIntegrationRouter(): express.Router {
    const router = express.Router();
    router.use(requireVoiceApiAccess);

    // Get all integrations status (array shape for dashboard)
    router.get('/status', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);
            const row = await loadTenantIntegrationFlags(tenantId);
            if (!row) {
                return res.json({ success: true, data: [] });
            }
            let slackConnected = false;
            let googleCalendarConnected = await isGoogleCalendarConnected(tenantId, row);
            let outlookConnected = false;
            let calendlyConnected = false;

            try {
                const slack = await voiceDb.query(
                    `select enabled from public.slack_connections where tenant_id = $1 limit 1`,
                    [tenantId]
                );
                slackConnected = !!slack.rows[0]?.enabled;
            } catch {
                slackConnected = false;
            }

            try {
                const calendars = await voiceDb.query(
                    `select provider, status, access_token from public.calendar_connections where tenant_id = $1`,
                    [tenantId]
                );
                for (const cal of calendars.rows) {
                    const active = isCalendarRowActive(cal);
                    if (cal.provider === 'google' && active) googleCalendarConnected = true;
                    if (cal.provider === 'outlook' && active) outlookConnected = true;
                    if (cal.provider === 'calendly' && active) calendlyConnected = true;
                }
            } catch {
                /* calendar_connections optional */
            }

            const professionalOnly = new Set([
                'servicetitan',
                'jobber',
                'housecallpro',
                'pipedrive',
            ]);
            const entries: Array<{ provider: string; connected: boolean; plan_required: string | null }> = [
                { provider: 'zapier', connected: !!row.zapier_connected, plan_required: null },
                { provider: 'hubspot', connected: !!row.hubspot_connected, plan_required: null },
                { provider: 'servicetitan', connected: !!row.servicetitan_connected, plan_required: 'professional' },
                { provider: 'jobber', connected: !!row.jobber_connected, plan_required: 'professional' },
                { provider: 'housecallpro', connected: !!row.housecallpro_connected, plan_required: 'professional' },
                {
                    provider: 'google-calendar',
                    connected: googleCalendarConnected,
                    plan_required: null,
                },
                {
                    provider: 'outlook',
                    connected: outlookConnected,
                    plan_required: null,
                },
                {
                    provider: 'calendly',
                    connected: calendlyConnected,
                    plan_required: 'professional',
                },
                { provider: 'slack', connected: slackConnected, plan_required: null },
                {
                    provider: 'pipedrive',
                    connected: !!(row.pipedrive_access_token || row.pipedrive_enabled),
                    plan_required: 'professional',
                },
                {
                    provider: 'freshsales',
                    connected: !!row.freshsales_connected,
                    plan_required: null,
                },
                {
                    provider: 'insightly',
                    connected: !!row.insightly_connected,
                    plan_required: null,
                },
            ];

            const syncTimes = await loadIntegrationSyncTimes(tenantId);

            const data = entries.map((e) => ({
                provider: e.provider,
                connected: e.connected,
                plan_required: professionalOnly.has(e.provider) ? e.plan_required : null,
                last_sync: syncTimes.get(e.provider) ?? null,
            }));

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Failed to get integration status', { error: String(error) });
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // Merged catalog status — legacy/OAuth flags + new encrypted integration_connections,
    // keyed by integration id, for the categorized Integration Hub UI.
    router.get('/catalog', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);
            const connections: Record<
                string,
                { status: string; last_sync_at: string | null; last_test_at: string | null; last_error: string | null }
            > = {};

            const genericRows = await connectionStore.listConnections(tenantId).catch((err) => {
                logger.warn('integration_connections unavailable; using legacy flags only', {
                    tenantId,
                    error: String(err),
                });
                return [];
            });
            for (const row of genericRows) {
                connections[row.integration_id] = {
                    status: row.status,
                    last_sync_at: row.last_sync_at,
                    last_test_at: row.last_test_at,
                    last_error: row.last_error,
                };
            }

            const flags = await loadTenantIntegrationFlags(tenantId);
            if (flags) {
                const syncTimes = await loadIntegrationSyncTimes(tenantId);
                let googleCalendarConnected = await isGoogleCalendarConnected(tenantId, flags);
                let outlookConnected = false;
                let calendlyConnected = false;
                let acuityConnected = false;
                let squareAppointmentsConnected = false;
                let slackConnected = false;

                try {
                    const slack = await voiceDb.query(
                        `select enabled from public.slack_connections where tenant_id = $1 limit 1`,
                        [tenantId]
                    );
                    slackConnected = !!slack.rows[0]?.enabled;
                } catch {
                    slackConnected = false;
                }

                try {
                    const calendars = await voiceDb.query(
                        `select provider, status, access_token from public.calendar_connections where tenant_id = $1`,
                        [tenantId]
                    );
                    for (const cal of calendars.rows) {
                        const active = isCalendarRowActive(cal);
                        if (cal.provider === 'google' && active) googleCalendarConnected = true;
                        if (cal.provider === 'outlook' && active) outlookConnected = true;
                        if (cal.provider === 'calendly' && active) calendlyConnected = true;
                        if (cal.provider === 'acuity' && active) acuityConnected = true;
                        if (cal.provider === 'square-appointments' && active) squareAppointmentsConnected = true;
                    }
                } catch {
                    /* calendar_connections optional */
                }

                const legacyEntries: Array<{ id: string; connected: boolean }> = [
                    { id: 'zapier', connected: !!flags.zapier_connected },
                    { id: 'hubspot', connected: !!flags.hubspot_connected },
                    { id: 'servicetitan', connected: !!flags.servicetitan_connected },
                    { id: 'jobber', connected: !!flags.jobber_connected },
                    { id: 'housecallpro', connected: !!flags.housecallpro_connected },
                    { id: 'google-calendar', connected: googleCalendarConnected },
                    { id: 'outlook', connected: outlookConnected },
                    { id: 'calendly', connected: calendlyConnected },
                    { id: 'acuity', connected: acuityConnected },
                    { id: 'square-appointments', connected: squareAppointmentsConnected },
                    { id: 'slack', connected: slackConnected },
                    { id: 'pipedrive', connected: !!(flags.pipedrive_access_token || flags.pipedrive_enabled) },
                    { id: 'freshsales', connected: !!flags.freshsales_connected },
                    { id: 'insightly', connected: !!flags.insightly_connected },
                ];

                for (const entry of legacyEntries) {
                    const existing = connections[entry.id];
                    connections[entry.id] = {
                        status: entry.connected ? 'connected' : 'disconnected',
                        last_sync_at: syncTimes.get(entry.id) ?? existing?.last_sync_at ?? null,
                        last_test_at: existing?.last_test_at ?? null,
                        last_error: entry.connected ? (existing?.last_error ?? null) : null,
                    };
                }
            }

            res.json({ success: true, data: { connections } });
        } catch (error) {
            logger.error('Failed to load integration catalog status', { error: String(error) });
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // Force inbound calendar + CRM sync (runs in background; returns immediately)
    router.post('/sync', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);
            const providers = Array.isArray(req.body?.providers)
                ? (req.body.providers as string[])
                : undefined;
            void integrationSyncService.syncTenant(tenantId, providers);
            res.json({
                success: true,
                message: 'Sync started',
                data: { tenantId, providers: providers ?? 'all' },
            });
        } catch (error) {
            logger.error('Failed to start integration sync', { error: String(error) });
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // Get specific integration status
    router.get('/:provider/status', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);
            const provider = String(req.params.provider || '').toLowerCase();

            if (GENERIC_CONNECTION_PROVIDERS.has(provider)) {
                const connection = await connectionStore.getConnection(tenantId, provider);
                const connected = connection?.status === 'connected';
                return res.json({
                    success: true,
                    data: {
                        enabled: connected,
                        connected,
                        status: connection?.status ?? 'disconnected',
                        last_sync_at: connection?.last_sync_at ?? null,
                        last_test_at: connection?.last_test_at ?? null,
                        last_error: connection?.last_error ?? null,
                    },
                });
            }

            const flags = await loadTenantIntegrationFlags(tenantId);
            if (!flags) {
                return res.status(404).json({ success: false, error: 'Tenant not found' });
            }

            let connected = false;
            if (provider === 'google-calendar' || provider === 'google') {
                connected = await isGoogleCalendarConnected(tenantId, flags);
            } else if (provider === 'pipedrive') {
                connected = !!(flags.pipedrive_access_token || flags.pipedrive_enabled);
            } else if (provider === 'freshsales') {
                connected = !!flags.freshsales_connected;
            } else {
                const key = provider.replace(/-/g, '_');
                connected = !!flags[`${key}_connected`];
            }

            const data: Record<string, unknown> = { enabled: connected, connected };
            if (provider === 'zapier' && connected) {
                const creds = await getProviderCredentials(tenantId, 'zapier');
                if (creds?.webhookUrl) data.webhookUrl = creds.webhookUrl;
            }

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Failed to get provider status', { error: String(error), provider: req.params.provider });
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // Configure integration (API key based)
    router.post('/:provider/configure', async (req: any, res: any) => {
        try {
            const r = req as CallIqAuthenticatedRequest;
            const tenantId = getTenantId(req);
            const provider = req.params.provider;
            const credentials = normalizeConfigureCredentials(provider, req.body);

            const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
            const perm = requirePermission(userRole, 'integrations:write');
            if (!perm.ok) {
                return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
            }

            const { assertOperationalAccess } = await import('../billing/account-access.service.js');
            const operational = await assertOperationalAccess(tenantId, 'integrations');
            if (!operational.allowed) {
                return res.status(403).json({ success: false, error: operational.reason });
            }

            const planGate = await assertIntegrationPlanAccess(tenantId, provider);
            if (planGate.ok === false) {
                return res.status(planGate.status).json({
                    success: false,
                    error: planGate.error,
                    currentPlan: planGate.currentPlan,
                });
            }

            if (GENERIC_CONNECTION_PROVIDERS.has(provider)) {
                const entry = getIntegrationCatalogEntry(provider);
                if (!entry) {
                    return res.status(404).json({ success: false, error: 'Unknown integration' });
                }

                const missing = entry.requiredFields.filter((field) => !String(credentials?.[field] ?? '').trim());
                if (missing.length > 0) {
                    return res.status(400).json({ success: false, error: `Please fill in: ${missing.join(', ')}` });
                }

                if (!entry.ready) {
                    return res.status(400).json({ success: false, error: 'This integration is not available yet.' });
                }

                const adapter = getProviderAdapter(entry.providerKey || '');
                const verifyResult = adapter
                    ? await adapter.verifyConnection(credentials)
                    : { success: false, message: 'Provider not available' };

                if (!verifyResult.success) {
                    await connectionStore.appendLog(tenantId, provider, 'connect', 'error', verifyResult.message);
                    await logAuditEvent(tenantId, provider, 'config_failed', { reason: verifyResult.message }, req);
                    return res.status(400).json({ success: false, error: verifyResult.message });
                }

                let connectMessage = verifyResult.message;
                if (adapter?.sendTest) {
                    const testResult = await adapter.sendTest(credentials);
                    if (!testResult.success) {
                        await connectionStore.appendLog(tenantId, provider, 'connect', 'error', testResult.message);
                        await logAuditEvent(tenantId, provider, 'config_failed', { reason: testResult.message }, req);
                        return res.status(400).json({ success: false, error: testResult.message });
                    }
                    connectMessage = testResult.message;
                }

                await connectionStore.upsertConnection(tenantId, provider, entry.authType, credentials, {
                    status: 'connected',
                });
                await connectionStore.markTested(
                    tenantId,
                    provider,
                    true,
                    undefined
                );
                await connectionStore.appendLog(tenantId, provider, 'connect', 'info', connectMessage);
                await logAuditEvent(tenantId, provider, 'connected', { method: 'api_key' }, req);
                publishIntegrationsUpdated(tenantId, provider);
                return res.json({ success: true, message: connectMessage });
            }

            const catalogEntry = getIntegrationCatalogEntry(provider);
            if (catalogEntry?.authType === 'api_credentials' && catalogEntry.requiredFields.length > 0) {
                const missing = catalogEntry.requiredFields.filter(
                    (field) => !String(credentials?.[field] ?? '').trim()
                );
                if (missing.length > 0) {
                    return res.status(400).json({ success: false, error: `Please fill in: ${missing.join(', ')}` });
                }
            }

            // Zapier: validate URL on save; live ping is optional via /test
            const testResult =
                provider === 'zapier'
                    ? validateZapierWebhookUrl(credentials.webhookUrl)
                    : await testProviderConnection(provider, credentials);
            if (!testResult.success) {
                await logAuditEvent(tenantId, provider, 'config_failed', { reason: testResult.message }, req);
                return res.status(400).json({ success: false, error: testResult.message });
            }

            let connectMessage = testResult.message;
            if (LEGACY_TEST_ON_CONFIGURE.has(provider)) {
                const leadTest = await sendProviderTestLead(provider, credentials);
                if (!leadTest.success) {
                    await logAuditEvent(tenantId, provider, 'config_failed', { reason: leadTest.message }, req);
                    return res.status(400).json({ success: false, error: leadTest.message });
                }
                connectMessage = leadTest.message;
            }

            if (provider === 'zapier' && 'webhookUrl' in testResult && testResult.webhookUrl) {
                credentials.webhookUrl = testResult.webhookUrl;
            }

            // Store credentials
            await storeProviderCredentials(tenantId, provider, credentials);

            await logAuditEvent(tenantId, provider, 'connected', { method: 'api_key' }, req);

            publishIntegrationsUpdated(tenantId, provider);

            res.json({ success: true, message: connectMessage });
        } catch (error) {
            logger.error('Failed to configure integration', { error: String(error), provider: req.params.provider });
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // Send a test lead to the connected CRM
    router.post('/:provider/test-lead', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);
            const provider = String(req.params.provider || '').toLowerCase();

            const planGate = await assertIntegrationPlanAccess(tenantId, provider);
            if (planGate.ok === false) {
                return res.status(planGate.status).json({
                    success: false,
                    error: planGate.error,
                    currentPlan: planGate.currentPlan,
                });
            }

            if (GENERIC_CONNECTION_PROVIDERS.has(provider)) {
                const entry = getIntegrationCatalogEntry(provider);
                const connection = await connectionStore.getConnection(tenantId, provider);
                if (!connection || connection.status === 'disconnected') {
                    return res.status(400).json({ success: false, error: 'Integration not configured' });
                }

                const credentials = await connectionStore.getDecryptedCredentials(tenantId, provider);
                const adapter = entry ? getProviderAdapter(entry.providerKey || '') : undefined;
                const result =
                    adapter && credentials
                        ? await adapter.sendTest(credentials)
                        : { success: false, message: 'Provider not available' };

                await connectionStore.markTested(tenantId, provider, result.success, result.success ? undefined : result.message);
                await connectionStore.appendLog(tenantId, provider, 'test', result.success ? 'info' : 'warn', result.message);
                await logAuditEvent(
                    tenantId,
                    provider,
                    result.success ? 'test_lead_success' : 'test_lead_failed',
                    { message: result.message, recordUrl: (result as { recordUrl?: string }).recordUrl },
                    req
                );

                if (!result.success) {
                    return res.status(400).json({ success: false, error: result.message });
                }

                publishIntegrationsUpdated(tenantId, provider);
                return res.json({ success: true, data: result });
            }

            const credentials = await getProviderCredentials(tenantId, provider);
            if (!credentials) {
                return res.status(400).json({ success: false, error: 'Integration not configured' });
            }

            const result = await sendProviderTestLead(provider, credentials);
            await logAuditEvent(
                tenantId,
                provider,
                result.success ? 'test_lead_success' : 'test_lead_failed',
                { message: result.message, recordUrl: result.recordUrl },
                req
            );

            if (!result.success) {
                return res.status(400).json({ success: false, error: result.message });
            }

            publishIntegrationsUpdated(tenantId, provider);
            res.json({ success: true, data: result });
        } catch (error) {
            logger.error('Failed to send test lead', { error: String(error), provider: req.params.provider });
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Test lead failed') });
        }
    });

    // Test connection
    router.post('/:provider/test', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);
            const provider = String(req.params.provider || '').toLowerCase();

            if (GENERIC_CONNECTION_PROVIDERS.has(provider)) {
                const entry = getIntegrationCatalogEntry(provider);
                const connection = await connectionStore.getConnection(tenantId, provider);
                if (!connection || connection.status === 'disconnected') {
                    return res.status(400).json({ success: false, error: 'Integration not configured' });
                }

                const credentials = await connectionStore.getDecryptedCredentials(tenantId, provider);
                const adapter = entry ? getProviderAdapter(entry.providerKey || '') : undefined;
                const result =
                    adapter && credentials
                        ? await adapter.verifyConnection(credentials)
                        : { success: false, message: 'Provider not available' };

                await connectionStore.markTested(tenantId, provider, result.success, result.success ? undefined : result.message);
                await connectionStore.appendLog(tenantId, provider, 'verify', result.success ? 'info' : 'warn', result.message);
                await logAuditEvent(tenantId, provider, result.success ? 'test_success' : 'test_failed', { message: result.message }, req);

                return res.json({ success: true, data: result });
            }

            // Get stored credentials
            const credentials = await getProviderCredentials(tenantId, provider);
            if (!credentials) {
                return res.status(400).json({ success: false, error: 'Integration not configured' });
            }

            // Test connection
            const result = await testProviderConnection(provider, credentials);

            await logAuditEvent(
                tenantId,
                provider,
                result.success ? 'test_success' : 'test_failed',
                { message: result.message },
                req
            );

            res.json({ success: true, data: result });
        } catch (error) {
            logger.error('Failed to test connection', { error: String(error), provider: req.params.provider });
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // Disconnect integration
    router.delete('/:provider/disconnect', async (req: any, res: any) => {
        try {
            const r = req as CallIqAuthenticatedRequest;
            const tenantId = getTenantId(req);
            const provider = String(req.params.provider || '').toLowerCase();

            const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
            const perm = requirePermission(userRole, 'integrations:write');
            if (!perm.ok) {
                return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
            }

            if (GENERIC_CONNECTION_PROVIDERS.has(provider)) {
                await connectionStore.clearConnection(tenantId, provider);
                await connectionStore.appendLog(tenantId, provider, 'disconnect', 'info');
                await logAuditEvent(tenantId, provider, 'disconnected', {}, req);
                publishIntegrationsUpdated(tenantId, provider);
                return res.json({ success: true, message: 'Integration disconnected successfully' });
            }

            await disconnectProvider(tenantId, provider);

            await logAuditEvent(tenantId, provider, 'disconnected', {}, req);

            publishIntegrationsUpdated(tenantId, provider);

            res.json({ success: true, message: 'Integration disconnected successfully' });
        } catch (error) {
            logger.error('Failed to disconnect integration', { error: String(error), provider: req.params.provider });
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // Get audit log
    router.get('/audit', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);
            const provider = req.query.provider as string | undefined;
            const limit = parseInt(req.query.limit as string) || 50;

            let query = `
                select id, provider, action, metadata, ip_address, created_at
                from public.integration_audit_log
                where tenant_id = $1
            `;
            const params: any[] = [tenantId];

            if (provider) {
                query += ` and provider = $2`;
                params.push(provider);
            }

            query += ` order by created_at desc limit $${params.length + 1}`;
            params.push(limit);

            const result = await voiceDb.query(query, params);

            res.json({ success: true, data: result.rows });
        } catch (error) {
            logger.error('Failed to get audit log', { error: String(error) });
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    return router;
}

// Helper functions

function normalizePipedriveDomain(domain: string): string {
    let d = domain.trim();
    if (!d) return 'https://api.pipedrive.com';
    d = d.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (d.includes('api.pipedrive.com')) return 'https://api.pipedrive.com';
    if (d.includes('.pipedrive.com')) return `https://${d.split('/')[0]}`;
    return `https://${d}.pipedrive.com`;
}

function normalizeConfigureCredentials(provider: string, raw: Record<string, unknown>): Record<string, unknown> {
    const trimmed = trimCredentialFields(raw);
    if (provider === 'pipedrive') {
        return {
            ...trimmed,
            accessToken: trimmed.apiToken ?? trimmed.accessToken,
            apiDomain: normalizePipedriveDomain(String(trimmed.apiDomain ?? '')),
        };
    }
    if (provider === 'copper') {
        const copper = parseCopperConfig(trimmed);
        return { userEmail: copper.userEmail, apiKey: copper.apiKey };
    }
    if (provider === 'zoho') {
        const dataCenter = String(trimmed.dataCenter ?? 'com').trim();
        return {
            ...trimmed,
            dataCenter,
            accountsServer: zohoAccountsHost(dataCenter),
        };
    }
    return trimmed;
}

async function getProviderCredentials(tenantId: string, provider: string): Promise<any> {
    const result = await voiceDb.query(
        `select * from public.voice_tenants where id = $1`,
        [tenantId]
    );

    if (!result.rows.length) return null;

    const row = result.rows[0];
    const meta = parseTenantMetadata(row.metadata);

    switch (provider) {
        case 'servicetitan':
            return row.servicetitan_api_key
                ? {
                      apiKey: row.servicetitan_api_key,
                      tenantId: row.servicetitan_tenant_id,
                      clientId: row.servicetitan_client_id,
                      clientSecret: row.servicetitan_client_secret,
                      appKey: row.servicetitan_app_key,
                  }
                : null;
        case 'jobber':
            return row.jobber_api_token
                ? {
                      apiToken: row.jobber_api_token,
                      accountId: row.jobber_account_id,
                  }
                : null;
        case 'housecallpro':
            return row.housecallpro_api_key
                ? {
                      apiKey: row.housecallpro_api_key,
                      companyId: row.housecallpro_company_id,
                  }
                : null;
        case 'salesforce':
            return row.salesforce_access_token
                ? {
                      instanceUrl: row.salesforce_instance_url,
                      accessToken: row.salesforce_access_token,
                  }
                : null;
        case 'hubspot':
            return row.hubspot_api_key
                ? {
                      apiKey: row.hubspot_api_key,
                      portalId: row.hubspot_portal_id,
                  }
                : null;
        case 'zapier':
            return row.zapier_webhook_url ? { webhookUrl: row.zapier_webhook_url } : null;
        case 'freshsales':
            if (meta.freshsales_access_token) {
                return {
                    accessToken: String(meta.freshsales_access_token),
                    domain: String(meta.freshsales_domain || ''),
                    orgDomain: meta.freshsales_org_domain ? String(meta.freshsales_org_domain) : undefined,
                    apiBaseUrl: meta.freshsales_api_base ? String(meta.freshsales_api_base) : undefined,
                };
            }
            return meta.freshsales_api_key
                ? {
                      apiKey: String(meta.freshsales_api_key),
                      domain: String(meta.freshsales_domain || ''),
                      orgDomain: meta.freshsales_org_domain ? String(meta.freshsales_org_domain) : undefined,
                      apiBaseUrl: meta.freshsales_api_base ? String(meta.freshsales_api_base) : undefined,
                  }
                : null;
        case 'insightly':
            return meta.insightly_api_key
                ? {
                      apiKey: String(meta.insightly_api_key),
                      apiBaseUrl: String(meta.insightly_api_base_url || ''),
                  }
                : null;
        case 'pipedrive':
            return meta.pipedrive_access_token
                ? {
                      accessToken: String(meta.pipedrive_access_token),
                      apiDomain: String(meta.pipedrive_api_domain || 'https://api.pipedrive.com'),
                  }
                : null;
        default:
            return null;
    }
}

async function storeProviderCredentials(tenantId: string, provider: string, credentials: any): Promise<void> {
    const updates: Record<string, any> = {};

    switch (provider) {
        case 'servicetitan':
            updates.servicetitan_enabled = true;
            updates.servicetitan_api_key = credentials.apiKey;
            updates.servicetitan_tenant_id = credentials.tenantId;
            updates.servicetitan_client_id = credentials.clientId || null;
            updates.servicetitan_client_secret = credentials.clientSecret || null;
            updates.servicetitan_app_key = credentials.appKey;
            break;
        case 'jobber':
            updates.jobber_enabled = true;
            updates.jobber_api_token = credentials.apiToken;
            updates.jobber_account_id = credentials.accountId || null;
            break;
        case 'housecallpro':
            updates.housecallpro_enabled = true;
            updates.housecallpro_api_key = credentials.apiKey;
            updates.housecallpro_company_id = credentials.companyId;
            break;
        case 'salesforce':
            updates.salesforce_enabled = true;
            updates.salesforce_instance_url = credentials.instanceUrl;
            updates.salesforce_access_token = credentials.accessToken;
            updates.salesforce_refresh_token = credentials.refreshToken || null;
            break;
        case 'hubspot':
            updates.hubspot_enabled = true;
            updates.hubspot_api_key = credentials.apiKey;
            updates.hubspot_portal_id = credentials.portalId || null;
            break;
        case 'zapier':
            updates.zapier_webhook_url = credentials.webhookUrl;
            break;
        case 'freshsales': {
            const domainInput = String(credentials.domain || '').trim();
            const orgDomain = domainInput.includes('myfreshworks.com')
                ? normalizeFreshworksOrgDomain(domainInput)
                : null;
            await mergeTenantMetadata(tenantId, {
                freshsales_enabled: true,
                freshsales_api_key: credentials.apiKey,
                freshsales_access_token: null,
                freshsales_refresh_token: null,
                freshsales_domain: orgDomain
                    ? orgDomain.replace(/\.myfreshworks\.com$/i, '')
                    : normalizeFreshsalesDomain(domainInput),
                freshsales_org_domain: orgDomain,
                freshsales_api_base: orgDomain ? `https://${orgDomain}/crm/sales/api` : null,
            });
            return;
        }
        case 'insightly':
            await mergeTenantMetadata(tenantId, {
                insightly_enabled: true,
                insightly_api_key: credentials.apiKey,
                insightly_api_base_url: String(credentials.apiBaseUrl || credentials.apiUrl || '').trim() || null,
            });
            return;
        case 'pipedrive':
            await mergeTenantMetadata(tenantId, {
                pipedrive_enabled: true,
                pipedrive_access_token: String(credentials.apiToken || credentials.accessToken || ''),
                pipedrive_api_domain: normalizePipedriveDomain(String(credentials.apiDomain || '')),
            });
            return;
        default:
            throw new Error(`Provider ${provider} configuration not supported`);
    }

    const setClause = Object.keys(updates)
        .map((key, idx) => `${key} = $${idx + 2}`)
        .join(', ');
    const values = Object.values(updates);

    await voiceDb.query(
        `update public.voice_tenants set ${setClause} where id = $1`,
        [tenantId, ...values]
    );
}

async function disconnectProvider(tenantId: string, provider: string): Promise<void> {
    switch (provider) {
        case 'google-calendar':
        case 'google': {
            const { calendarService } = await import('../calendar/calendar.service.js');
            await calendarService.disconnect(tenantId);
            return;
        }
        case 'outlook': {
            const { outlookCalendarService } = await import('../calendar/outlook.calendar.service.js');
            await outlookCalendarService.disconnect(tenantId);
            return;
        }
        case 'slack':
            await voiceDb.query(
                `update public.slack_connections set enabled = false, updated_at = now() where tenant_id = $1`,
                [tenantId]
            );
            return;
        case 'pipedrive':
            await voiceDb.query(
                `update public.voice_tenants
                 set metadata = coalesce(metadata, '{}'::jsonb)
                   - 'pipedrive_enabled'
                   - 'pipedrive_access_token'
                   - 'pipedrive_api_domain',
                     updated_at = now()
                 where id = $1`,
                [tenantId]
            );
            return;
        case 'freshsales':
            await mergeTenantMetadata(tenantId, {
                freshsales_enabled: false,
                freshsales_api_key: null,
                freshsales_access_token: null,
                freshsales_refresh_token: null,
                freshsales_domain: null,
                freshsales_org_domain: null,
                freshsales_api_base: null,
            });
            return;
        case 'insightly':
            await mergeTenantMetadata(tenantId, {
                insightly_enabled: false,
                insightly_api_key: null,
                insightly_api_base_url: null,
            });
            return;
        default:
            await clearProviderCredentials(tenantId, provider);
    }
}

async function clearProviderCredentials(tenantId: string, provider: string): Promise<void> {
    const updates: Record<string, any> = {};

    switch (provider) {
        case 'servicetitan':
            updates.servicetitan_enabled = false;
            updates.servicetitan_api_key = null;
            updates.servicetitan_tenant_id = null;
            updates.servicetitan_client_id = null;
            updates.servicetitan_client_secret = null;
            updates.servicetitan_app_key = null;
            break;
        case 'jobber':
            updates.jobber_enabled = false;
            updates.jobber_api_token = null;
            updates.jobber_account_id = null;
            break;
        case 'housecallpro':
            updates.housecallpro_enabled = false;
            updates.housecallpro_api_key = null;
            updates.housecallpro_company_id = null;
            break;
        case 'salesforce':
            updates.salesforce_enabled = false;
            updates.salesforce_instance_url = null;
            updates.salesforce_access_token = null;
            updates.salesforce_refresh_token = null;
            await connectionStore.clearConnection(tenantId, 'salesforce');
            break;
        case 'hubspot':
            updates.hubspot_enabled = false;
            updates.hubspot_api_key = null;
            updates.hubspot_portal_id = null;
            await mergeTenantMetadata(tenantId, { hubspot_refresh_token: null });
            break;
        case 'zapier':
            updates.zapier_webhook_url = null;
            break;
        default:
            throw new Error(`Provider ${provider} disconnect is not supported via API keys`);
    }

    if (Object.keys(updates).length === 0) {
        return;
    }

    const setClause = Object.keys(updates)
        .map((key, idx) => `${key} = $${idx + 2}`)
        .join(', ');
    const values = Object.values(updates);

    await voiceDb.query(
        `update public.voice_tenants set ${setClause} where id = $1`,
        [tenantId, ...values]
    );
}

function validateZapierWebhookUrl(webhookUrl: unknown): { success: boolean; message: string; webhookUrl?: string } {
    const url = typeof webhookUrl === 'string' ? webhookUrl.trim() : '';
    if (!url.startsWith('https://hooks.zapier.com/')) {
        return {
            success: false,
            message: 'Paste the full Zapier Catch Hook URL (https://hooks.zapier.com/hooks/catch/...)',
        };
    }
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'hooks.zapier.com') {
            return { success: false, message: 'Webhook URL must be on hooks.zapier.com' };
        }
    } catch {
        return { success: false, message: 'Invalid webhook URL' };
    }
    return { success: true, message: 'Webhook URL valid', webhookUrl: url };
}

function sampleZapierLeadPayload() {
    return {
        test: true,
        source: 'call_iq',
        type: 'lead',
        tenantId: 'test',
        callId: 'test-call',
        provider: 'zapier',
        lead: {
            name: 'Test Lead (Call IQ)',
            phone: '+15551234567',
            email: 'test@example.com',
            service: 'HVAC service call',
            notes: 'Sample payload from Call IQ — map lead.name, lead.phone, lead.email in Zapier.',
        },
        timestamp: new Date().toISOString(),
    };
}

async function pingZapierWebhook(webhookUrl: string): Promise<{ success: boolean; message: string }> {
    const hookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleZapierLeadPayload()),
    });
    const httpStatus = (hookRes as unknown as { status: number }).status;
    if (hookRes.ok) {
        return { success: true, message: 'Test sent — check Zapier task history for the sample lead.' };
    }
    if (httpStatus === 404) {
        return {
            success: false,
            message: 'Zapier returned 404 — turn your Zap ON in Zapier, then click Send test again.',
        };
    }
    return {
        success: false,
        message: `Webhook test failed (HTTP ${httpStatus})`,
    };
}

async function testProviderConnection(provider: string, credentials: any): Promise<{ success: boolean; message: string }> {
    try {
        switch (provider) {
            case 'servicetitan':
                // Try to fetch tenant info
                const stResponse = await fetch(`https://api.servicetitan.io/tenant/v2/tenant/${credentials.tenantId}`, {
                    headers: {
                        'Authorization': `Bearer ${credentials.apiKey}`,
                        'ST-App-Key': credentials.appKey,
                    },
                });
                return {
                    success: stResponse.ok,
                    message: stResponse.ok ? 'Connected to ServiceTitan successfully' : 'Invalid ServiceTitan credentials',
                };

            case 'jobber': {
                const jobber = new JobberProvider();
                return jobber.verifyConnection({
                    apiToken: String(credentials.apiToken || ''),
                    accountId: String(credentials.accountId || ''),
                });
            }

            case 'housecallpro':
                const hcpResponse = await fetch(`https://api.housecallpro.com/v2/company`, {
                    headers: {
                        Authorization: `Bearer ${credentials.apiKey}`,
                    },
                });
                return {
                    success: hcpResponse.ok,
                    message: hcpResponse.ok ? 'Connected to HouseCallPro successfully' : 'Invalid API key or company ID',
                };

            case 'salesforce':
                // Try to query Salesforce API
                const sfResponse = await fetch(`${credentials.instanceUrl}/services/data/v58.0/sobjects`, {
                    headers: {
                        'Authorization': `Bearer ${credentials.accessToken}`,
                    },
                });
                return {
                    success: sfResponse.ok,
                    message: sfResponse.ok ? 'Connected to Salesforce successfully' : 'Invalid Salesforce credentials',
                };

            case 'hubspot':
                const hsResponse = await fetch(`https://api.hubapi.com/account-info/v3/details`, {
                    headers: {
                        Authorization: `Bearer ${credentials.apiKey}`,
                    },
                });
                return {
                    success: hsResponse.ok,
                    message: hsResponse.ok ? 'Connected to HubSpot successfully' : 'Invalid API key',
                };

            case 'zapier': {
                const validated = validateZapierWebhookUrl(credentials.webhookUrl);
                if (!validated.success || !validated.webhookUrl) {
                    return validated;
                }
                return pingZapierWebhook(validated.webhookUrl);
            }

            case 'freshsales': {
                const freshsales = new FreshsalesProvider();
                return freshsales.verifyConnection({
                    apiKey: credentials.apiKey ? String(credentials.apiKey) : undefined,
                    accessToken: credentials.accessToken ? String(credentials.accessToken) : undefined,
                    domain: String(credentials.domain || ''),
                    orgDomain: credentials.orgDomain ? String(credentials.orgDomain) : undefined,
                    apiBaseUrl: credentials.apiBaseUrl ? String(credentials.apiBaseUrl) : undefined,
                });
            }

            case 'insightly': {
                const insightly = new InsightlyProvider();
                return insightly.verifyConnection({
                    apiKey: credentials.apiKey,
                    apiBaseUrl: credentials.apiBaseUrl ? String(credentials.apiBaseUrl) : undefined,
                });
            }

            case 'pipedrive': {
                const pipedrive = new PipedriveProvider();
                return pipedrive.verifyConnection({
                    accessToken: String(credentials.accessToken),
                    apiDomain: String(credentials.apiDomain || 'https://api.pipedrive.com'),
                });
            }

            default:
                return { success: false, message: 'Provider test not implemented' };
        }
    } catch (error) {
        return { success: false, message: clientErrorMessage(error, 'Connection test failed') };
    }
}

const TEST_LEAD_PAYLOAD = {
    callId: `test-${Date.now()}`,
    type: 'lead' as const,
    lead: {
        name: 'Test Lead (Call IQ)',
        phone: '+15551234567',
        email: 'test-lead@calliq.example',
        service: 'Connection test',
        notes: 'This test lead was created by Call IQ to verify your CRM connection.',
    },
};

async function sendProviderTestLead(
    provider: string,
    credentials: Record<string, unknown>
): Promise<{ success: boolean; message: string; recordUrl?: string }> {
    try {
        switch (provider) {
            case 'freshsales': {
                const freshsales = new FreshsalesProvider();
                return freshsales.sendTestLead({
                    apiKey: credentials.apiKey ? String(credentials.apiKey) : undefined,
                    accessToken: credentials.accessToken ? String(credentials.accessToken) : undefined,
                    domain: String(credentials.domain || ''),
                    orgDomain: credentials.orgDomain ? String(credentials.orgDomain) : undefined,
                    apiBaseUrl: credentials.apiBaseUrl ? String(credentials.apiBaseUrl) : undefined,
                });
            }
            case 'insightly': {
                const insightly = new InsightlyProvider();
                return insightly.sendTestLead({
                    apiKey: String(credentials.apiKey),
                    apiBaseUrl: credentials.apiBaseUrl ? String(credentials.apiBaseUrl) : undefined,
                });
            }
            case 'pipedrive': {
                const pipedrive = new PipedriveProvider();
                return pipedrive.sendTestLead({
                    accessToken: String(credentials.accessToken),
                    apiDomain: String(credentials.apiDomain || 'https://api.pipedrive.com'),
                });
            }
            case 'hubspot': {
                const hubspot = new HubSpotProvider();
                await hubspot.sendLead(
                    {
                        apiKey: String(credentials.apiKey),
                        portalId: String(credentials.portalId || ''),
                    },
                    TEST_LEAD_PAYLOAD
                );
                return { success: true, message: 'Lead successfully created in HubSpot' };
            }
            case 'salesforce': {
                const salesforce = new SalesforceProvider();
                await salesforce.sendLead(
                    {
                        instanceUrl: String(credentials.instanceUrl),
                        accessToken: String(credentials.accessToken),
                    },
                    TEST_LEAD_PAYLOAD
                );
                return { success: true, message: 'Lead successfully created in Salesforce' };
            }
            case 'jobber': {
                const jobber = new JobberProvider();
                return jobber.sendTestLead({
                    apiToken: String(credentials.apiToken),
                    accountId: String(credentials.accountId || ''),
                });
            }
            case 'servicetitan': {
                const st = new ServiceTitanProvider();
                await st.sendLead(
                    {
                        apiKey: String(credentials.apiKey),
                        tenantId: String(credentials.tenantId),
                        clientId: String(credentials.clientId || ''),
                        clientSecret: String(credentials.clientSecret || ''),
                        appKey: String(credentials.appKey),
                    },
                    TEST_LEAD_PAYLOAD
                );
                return { success: true, message: 'Lead successfully created in ServiceTitan' };
            }
            case 'housecallpro': {
                const hcp = new HouseCallProProvider();
                await hcp.sendLead(
                    {
                        apiKey: String(credentials.apiKey),
                        companyId: String(credentials.companyId),
                    },
                    TEST_LEAD_PAYLOAD
                );
                return { success: true, message: 'Lead successfully created in Housecall Pro' };
            }
            case 'zapier': {
                const ping = await pingZapierWebhook(String(credentials.webhookUrl));
                return {
                    success: ping.success,
                    message: ping.success
                        ? 'Test lead sent — check your CRM for the sample lead.'
                        : ping.message,
                };
            }
            default:
                return { success: false, message: 'Test lead is not available for this integration yet.' };
        }
    } catch (error) {
        return { success: false, message: clientErrorMessage(error, 'Test lead failed') };
    }
}

