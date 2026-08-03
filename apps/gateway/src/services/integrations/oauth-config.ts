import { getGatewayPublicHttpsBase, getJobberRedirectUri, getSlackRedirectUri } from '../env.js';

export function getGatewayOAuthBaseUrl(): string {
  return (getGatewayPublicHttpsBase() || 'https://call-iq-gateway.onrender.com').replace(/\/$/, '');
}

/** Must match HubSpot developer app → Auth → Required scopes exactly. */
export const HUBSPOT_REQUIRED_SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  'crm.objects.contracts.read',
] as const;

/** Optional in HubSpot app settings — use optional_scope= only when enabled on the app. */
export const HUBSPOT_OPTIONAL_SCOPES = [] as const;

function parseScopeEnv(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

export function getHubSpotOAuthConfig() {
  const base = getGatewayOAuthBaseUrl();
  const scopes = parseScopeEnv(process.env.HUBSPOT_OAUTH_SCOPES);
  const optionalEnv = process.env.HUBSPOT_OAUTH_OPTIONAL_SCOPES;
  const optionalScopes =
    optionalEnv !== undefined
      ? parseScopeEnv(optionalEnv)
      : [...HUBSPOT_OPTIONAL_SCOPES];

  return {
    clientId: process.env.HUBSPOT_CLIENT_ID?.trim() || '',
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET?.trim() || '',
    redirectUri: `${base}/api/v1/integrations/hubspot/callback`,
    scopes: scopes.length > 0 ? scopes : [...HUBSPOT_REQUIRED_SCOPES],
    optionalScopes,
  };
}

export function getSalesforceOAuthConfig() {
  const base = getGatewayOAuthBaseUrl();
  const loginUrl =
    process.env.SALESFORCE_LOGIN_URL?.trim().replace(/\/$/, '') || 'https://login.salesforce.com';
  return {
    clientId: process.env.SALESFORCE_CLIENT_ID?.trim() || '',
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET?.trim() || '',
    redirectUri: `${base}/api/v1/integrations/salesforce/callback`,
    loginUrl,
  };
}

export function getSlackOAuthConfig() {
  return {
    clientId: process.env.SLACK_CLIENT_ID?.trim() || '',
    clientSecret: process.env.SLACK_CLIENT_SECRET?.trim() || '',
    redirectUri: getSlackRedirectUri(),
    scopes: ['incoming-webhook', 'chat:write'],
  };
}

export function getServiceTitanOAuthConfig() {
  const base = getGatewayOAuthBaseUrl();
  return {
    clientId: process.env.SERVICETITAN_CLIENT_ID?.trim() || '',
    clientSecret: process.env.SERVICETITAN_CLIENT_SECRET?.trim() || '',
    redirectUri: `${base}/api/v1/integrations/servicetitan/callback`,
  };
}

export function getJobberOAuthConfig() {
  return {
    clientId: process.env.JOBBER_CLIENT_ID?.trim() || '',
    clientSecret: process.env.JOBBER_CLIENT_SECRET?.trim() || '',
    redirectUri: getJobberRedirectUri(),
  };
}

export function getPipedriveOAuthConfig() {
  const base = getGatewayOAuthBaseUrl();
  return {
    clientId: process.env.PIPEDRIVE_CLIENT_ID?.trim() || '',
    clientSecret: process.env.PIPEDRIVE_CLIENT_SECRET?.trim() || '',
    redirectUri: `${base}/api/v1/integrations/pipedrive/callback`,
  };
}

export const FRESHSALES_SUITE_OAUTH_SCOPES = [
  'freshsales.contacts.create',
  'freshsales.contacts.upsert',
  'freshsales.contacts.filters.view',
  'freshsales.selectors.view',
] as const;

export function getFreshsalesOAuthConfig() {
  const base = getGatewayOAuthBaseUrl();
  const scopes = parseScopeEnv(process.env.FRESHSALES_OAUTH_SCOPES);
  return {
    clientId: process.env.FRESHSALES_CLIENT_ID?.trim() || '',
    clientSecret: process.env.FRESHSALES_CLIENT_SECRET?.trim() || '',
    redirectUri: `${base}/api/v1/integrations/freshsales/callback`,
    scopes:
      scopes.length > 0
        ? scopes
        : [...FRESHSALES_SUITE_OAUTH_SCOPES],
  };
}

export function getZohoOAuthConfig() {
  const base = getGatewayOAuthBaseUrl();
  return {
    clientId: process.env.ZOHO_CLIENT_ID?.trim() || '',
    clientSecret: process.env.ZOHO_CLIENT_SECRET?.trim() || '',
    redirectUri: `${base}/api/v1/integrations/zoho/callback`,
    scopes: ['ZohoCRM.modules.leads.CREATE', 'ZohoCRM.modules.leads.READ', 'ZohoCRM.users.READ'],
  };
}

export function getCopperOAuthConfig() {
  const base = getGatewayOAuthBaseUrl();
  return {
    clientId: process.env.COPPER_CLIENT_ID?.trim() || '',
    clientSecret: process.env.COPPER_CLIENT_SECRET?.trim() || '',
    redirectUri: `${base}/api/v1/integrations/copper/callback`,
    scope: 'developer/v1/all',
  };
}

export function getClioOAuthConfig() {
  const base = getGatewayOAuthBaseUrl();
  // Clio's OAuth authorize endpoint does not use granular scopes — access is
  // based on the signed-in user's permissions in their firm. Sending an
  // unrecognized scope value can cause Clio's authorize page to loop back to
  // sign-in instead of redirecting. Only send &scope= if explicitly configured.
  const scopes = parseScopeEnv(process.env.CLIO_OAUTH_SCOPES);
  return {
    clientId: process.env.CLIO_CLIENT_ID?.trim() || '',
    clientSecret: process.env.CLIO_CLIENT_SECRET?.trim() || '',
    redirectUri: `${base}/api/v1/integrations/clio/callback`,
    deauthorizeUri: `${base}/api/v1/integrations/clio/deauthorize`,
    scopes,
  };
}

export function getSquareOAuthConfig() {
  const base = getGatewayOAuthBaseUrl();
  return {
    clientId: process.env.SQUARE_CLIENT_ID?.trim() || '',
    clientSecret: process.env.SQUARE_CLIENT_SECRET?.trim() || '',
    redirectUri: `${base}/api/v1/calendar/square-appointments/callback`,
  };
}
