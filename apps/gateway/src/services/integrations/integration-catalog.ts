/**
 * Server-side integration catalog — validation subset of the dashboard's
 * integration-hub-catalog.ts. Drives generic credential validation and
 * provider-registry dispatch in integration.controller.ts.
 */

export type IntegrationCategory =
    | 'crm'
    | 'calendar'
    | 'field_service'
    | 'property_management'
    | 'communication'
    | 'automation';

export type IntegrationAuthType = 'oauth' | 'api_credentials';

export type IntegrationCatalogEntry = {
    id: string;
    category: IntegrationCategory;
    authType: IntegrationAuthType;
    /** Required credential field keys for api_credentials integrations */
    requiredFields: string[];
    /** Key used to look up the provider adapter in provider-registry.ts */
    providerKey?: string;
    /** OAuth tokens stored in integration_connections (not voice_tenants legacy columns) */
    usesConnectionStore?: boolean;
    /** False = "coming soon" — credentials stored, verify/test return friendly placeholder */
    ready: boolean;
    /** True = no direct credential/OAuth path — only connects via the shared Zapier webhook. */
    zapierOnly?: boolean;
};

export const INTEGRATION_CATALOG: IntegrationCatalogEntry[] = [
    // ───────────── CRM ─────────────
    { id: 'hubspot', category: 'crm', authType: 'oauth', requiredFields: [], ready: true },
    { id: 'pipedrive', category: 'crm', authType: 'api_credentials', requiredFields: [], ready: true, zapierOnly: true },
    { id: 'salesforce', category: 'crm', authType: 'api_credentials', requiredFields: [], ready: true, zapierOnly: true },
    {
        id: 'freshsales',
        category: 'crm',
        authType: 'api_credentials',
        requiredFields: ['apiKey', 'domain'],
        providerKey: 'freshsales',
        ready: true,
    },
    {
        id: 'insightly',
        category: 'crm',
        authType: 'api_credentials',
        requiredFields: ['apiKey'],
        providerKey: 'insightly',
        ready: true,
    },
    {
        id: 'zoho',
        category: 'crm',
        authType: 'oauth',
        /** Self Client refresh-token connect when OAuth consent is blocked */
        requiredFields: ['dataCenter', 'clientId', 'clientSecret', 'refreshToken'],
        providerKey: 'zoho',
        usesConnectionStore: true,
        ready: true,
    },
    {
        id: 'copper',
        category: 'crm',
        authType: 'api_credentials',
        requiredFields: [],
        providerKey: 'copper',
        usesConnectionStore: true,
        ready: true,
        zapierOnly: true,
    },
    {
        id: 'followupboss',
        category: 'crm',
        authType: 'api_credentials',
        requiredFields: ['apiKey'],
        providerKey: 'followupboss',
        ready: true,
    },
    {
        id: 'clio',
        category: 'crm',
        authType: 'oauth',
        requiredFields: [],
        providerKey: 'clio',
        usesConnectionStore: true,
        ready: true,
    },
    {
        id: 'mycase',
        category: 'crm',
        authType: 'api_credentials',
        requiredFields: ['apiKey'],
        providerKey: 'mycase',
        ready: true,
    },

    // ───────────── Calendar ─────────────
    { id: 'google-calendar', category: 'calendar', authType: 'oauth', requiredFields: [], ready: true },
    { id: 'outlook', category: 'calendar', authType: 'oauth', requiredFields: [], ready: true },
    { id: 'calendly', category: 'calendar', authType: 'oauth', requiredFields: [], ready: true },
    { id: 'acuity', category: 'calendar', authType: 'oauth', requiredFields: [], ready: true },
    { id: 'square-appointments', category: 'calendar', authType: 'oauth', requiredFields: [], ready: true },
    {
        id: 'setmore',
        category: 'calendar',
        authType: 'api_credentials',
        requiredFields: ['apiKey'],
        providerKey: 'setmore',
        ready: true,
    },
    {
        id: 'vagaro',
        category: 'calendar',
        authType: 'api_credentials',
        requiredFields: ['businessId', 'apiKey'],
        providerKey: 'vagaro',
        ready: true,
    },
    {
        id: 'mindbody',
        category: 'calendar',
        authType: 'api_credentials',
        requiredFields: ['siteId', 'apiKey'],
        providerKey: 'mindbody',
        ready: true,
    },

    // ───────────── Field Service ─────────────
    { id: 'servicetitan', category: 'field_service', authType: 'api_credentials', requiredFields: [], ready: true, zapierOnly: true },
    { id: 'jobber', category: 'field_service', authType: 'oauth', requiredFields: [], ready: true },
    {
        id: 'housecallpro',
        category: 'field_service',
        authType: 'api_credentials',
        requiredFields: ['apiKey', 'companyId'],
        providerKey: 'housecallpro',
        ready: true,
    },

    // ───────────── Property Management ─────────────
    {
        id: 'buildium',
        category: 'property_management',
        authType: 'api_credentials',
        requiredFields: ['clientId', 'clientSecret'],
        providerKey: 'buildium',
        ready: true,
    },
    {
        id: 'appfolio',
        category: 'property_management',
        authType: 'api_credentials',
        requiredFields: ['apiDomain', 'clientId', 'clientSecret'],
        providerKey: 'appfolio',
        ready: true,
    },
    {
        id: 'yardi',
        category: 'property_management',
        authType: 'api_credentials',
        requiredFields: ['apiDomain', 'clientId', 'clientSecret'],
        providerKey: 'yardi',
        ready: true,
    },

    // ───────────── Communication ─────────────
    { id: 'slack', category: 'communication', authType: 'oauth', requiredFields: [], ready: true },

    // ───────────── Advanced Automation ─────────────
    {
        id: 'zapier',
        category: 'automation',
        authType: 'api_credentials',
        requiredFields: ['webhookUrl'],
        providerKey: 'zapier',
        ready: true,
    },
];

export function getIntegrationCatalogEntry(id: string): IntegrationCatalogEntry | undefined {
    return INTEGRATION_CATALOG.find((entry) => entry.id === id);
}

/** Provider ids whose OAuth flows use legacy voice_tenants columns (not connection store). */
export const OAUTH_FALLTHROUGH_PROVIDERS = new Set(
    INTEGRATION_CATALOG.filter((e) => e.authType === 'oauth' && !e.usesConnectionStore).map((e) => e.id)
);

/** Integration ids marked "coming soon" — credentials stored, verify/test return a friendly placeholder. */
export const COMING_SOON_PROVIDERS = new Set(INTEGRATION_CATALOG.filter((e) => !e.ready).map((e) => e.id));

/**
 * Provider keys for the 7 legacy API-key integrations with existing, untouched
 * switch-based logic in integration.controller.ts / integration.service.ts.
 */
const LEGACY_SWITCH_PROVIDERS = new Set(['servicetitan', 'jobber', 'housecallpro', 'hubspot', 'freshsales', 'insightly']);

/**
 * Integration ids handled by the generic connection-store + provider-registry path
 * (Phase 2/3 additions). Everything else falls through to the existing,
 * untouched switch-based logic in integration.controller.ts.
 */
export const GENERIC_CONNECTION_PROVIDERS = new Set(
    INTEGRATION_CATALOG.filter(
        (e) => e.providerKey && e.providerKey !== 'zapier' && !LEGACY_SWITCH_PROVIDERS.has(e.providerKey)
    ).map((e) => e.id)
);
