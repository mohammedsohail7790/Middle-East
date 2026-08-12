import express from 'express';
import { createCallsRouter, createVoiceRouter, createTenantsRouter } from '../services/voice/voice.controller.js';
import { createDashboardRouter } from '../services/dashboard/dashboard.controller.js';
import { createDashboardAssistantRouter } from '../services/dashboard-assistant/dashboard-assistant.controller.js';
import { createKnowledgeRouter } from '../services/knowledge/knowledge.controller.js';
import { createAppointmentsRouter } from '../services/appointments/appointments.controller.js';
import { createRecordingRouter } from '../services/recordings/recording.controller.js';
import { createAnalyticsRouter } from '../services/analytics/analytics.controller.js';
import { createSmsRouter } from '../services/sms/sms.controller.js';
import { createLeadsRouter } from '../services/leads/leads.controller.js';
import { createTeamRouter } from '../services/team/team.controller.js';
import { createBusinessHoursRouter } from '../services/business-hours/business-hours.controller.js';
import { createAIConfigRouter } from '../services/ai-config/ai-config.controller.js';
import { createPhoneNumbersRouter } from '../services/phone-provisioning/phoneNumbers.controller.js';
import { createAuditLogsRouter } from '../services/audit/audit.controller.js';
import { createApiKeysRouter } from '../services/api-keys/apiKeys.controller.js';
import { createWebhooksRouter } from '../services/webhooks/webhooks.controller.js';
import { createQARouter } from '../services/qa/qa.controller.js';
import { createSearchRouter } from '../services/search/search.controller.js';
import { createComplianceRouter } from '../services/compliance/compliance.controller.js';
import { createComplianceCenterRouter } from '../services/compliance/compliance-center.controller.js';
import { createRuntimeReliabilityRouter } from '../services/runtime-reliability/reliability.controller.js';
import { createOperationsRouter } from '../operations/operations.controller.js';
import { createSupportRouter } from '../support/support.controller.js';
import { createFeatureFlagsRouter } from '../services/feature-flags/feature-flags.controller.js';
import { createIVRRouter } from '../services/ivr/ivr.controller.js';
import { createRetentionRouter } from '../services/data-retention/retention.controller.js';
import { createReportsRouter } from '../services/scheduled-reports/reports.controller.js';
import { createMSPRouter } from '../services/msp/msp.controller.js';
import { createIPAllowlistRouter } from '../services/security/ipAllowlist.controller.js';
import { createVoiceCloningRouter } from '../services/voice-cloning/voiceCloning.controller.js';
import { createSpamRouter } from '../services/spam/spam.controller.js';
import { createOnboardingRouter } from '../services/onboarding/onboarding.controller.js';
import { createOrganizationsRouter } from '../services/organizations/organization.controller.js';
import { createCrmRouter } from '../services/crm/crm.controller.js';
import { createChannelsRouter } from '../services/channels/channels.controller.js';
import { createIntegrationsRouter } from '../services/integrations/integrations.controller.js';
import { ipAllowlistMiddleware } from '../services/security/ipAllowlist.js';
import { apiAuthUnlessPublic } from '../middleware/api-auth-unless-public.js';
import { csrfProtectionMiddleware } from '../middleware/csrf.js';
import { apiScopeMiddleware } from '../middleware/api-scopes.js';
import { enforceMfaMiddleware } from '../middleware/enforce-mfa.js';

export function createApiRouter(): express.Router {
    const apiRouter = express.Router();

    apiRouter.use(apiAuthUnlessPublic);
    apiRouter.use(ipAllowlistMiddleware);
    apiRouter.use((req, res, next) => {
        void csrfProtectionMiddleware(req, res, next);
    });
    apiRouter.use(apiScopeMiddleware);
    // HIPAA §164.312(d) — Enforce MFA when required by tenant org policy
    apiRouter.use(enforceMfaMiddleware);

    apiRouter.use('/voice', createVoiceRouter());
    apiRouter.use('/tenants', createTenantsRouter());
    apiRouter.use('/organizations', createOrganizationsRouter());
    apiRouter.use('/crm', createCrmRouter());
    apiRouter.use('/channels', createChannelsRouter());
    apiRouter.use('/integrations', createIntegrationsRouter());
    apiRouter.use('/leads', createLeadsRouter());
    apiRouter.use('/calls', createCallsRouter());
    apiRouter.use('/appointments', createAppointmentsRouter());
    apiRouter.use('/dashboard', createDashboardRouter());
    apiRouter.use('/dashboard-assistant', createDashboardAssistantRouter());
    apiRouter.use('/knowledge', createKnowledgeRouter());
    apiRouter.use('/recordings', createRecordingRouter());
    apiRouter.use('/analytics', createAnalyticsRouter());
    apiRouter.use('/sms', createSmsRouter());
    apiRouter.use('/team', createTeamRouter());
    apiRouter.use('/business-hours', createBusinessHoursRouter());
    apiRouter.use('/ai-config', createAIConfigRouter());
    apiRouter.use('/phone-numbers', createPhoneNumbersRouter());

    apiRouter.use('/audit-logs', createAuditLogsRouter());
    apiRouter.use('/api-keys', createApiKeysRouter());
    apiRouter.use('/webhooks', createWebhooksRouter());
    apiRouter.use('/qa', createQARouter());
    apiRouter.use('/ivr', createIVRRouter());
    apiRouter.use('/retention', createRetentionRouter());
    apiRouter.use('/reports', createReportsRouter());
    apiRouter.use('/msp', createMSPRouter());
    apiRouter.use('/ip-allowlist', createIPAllowlistRouter());
    apiRouter.use('/voice-cloning', createVoiceCloningRouter());
    apiRouter.use('/spam', createSpamRouter());
    apiRouter.use('/onboarding', createOnboardingRouter());
    apiRouter.use('/search', createSearchRouter());
    apiRouter.use('/compliance', createComplianceRouter());
    apiRouter.use('/compliance/center', createComplianceCenterRouter());
    apiRouter.use('/runtime-reliability', createRuntimeReliabilityRouter());
    apiRouter.use('/operations', createOperationsRouter());
    apiRouter.use('/support', createSupportRouter());
    apiRouter.use('/feature-flags', createFeatureFlagsRouter());

    return apiRouter;
}
