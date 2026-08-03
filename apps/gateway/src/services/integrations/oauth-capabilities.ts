import {
  getCalendlyRedirectUri,
  getGoogleCalendarRedirectUri,
  getOutlookCalendarRedirectUri,
  getAcuityRedirectUri,
  getSquareRedirectUri,
  getSlackRedirectUri,
} from '../env.js';
import {
  getHubSpotOAuthConfig,
  getSlackOAuthConfig,
  getServiceTitanOAuthConfig,
  getJobberOAuthConfig,
  getPipedriveOAuthConfig,
  getFreshsalesOAuthConfig,
  getZohoOAuthConfig,
  getCopperOAuthConfig,
  getClioOAuthConfig,
} from './oauth-config.js';

export type OAuthCapability = {
  provider: string;
  configured: boolean;
  authPath: string;
  callbackUrl: string;
  envVars: string[];
  scopes?: string[];
  optionalScopes?: string[];
};

export function getOAuthCapabilities(): OAuthCapability[] {
  const hubspot = getHubSpotOAuthConfig();
  const slack = getSlackOAuthConfig();
  const servicetitan = getServiceTitanOAuthConfig();
  const jobber = getJobberOAuthConfig();
  const pipedrive = getPipedriveOAuthConfig();
  const freshsales = getFreshsalesOAuthConfig();
  const zoho = getZohoOAuthConfig();
  const copper = getCopperOAuthConfig();
  const clio = getClioOAuthConfig();
  const googleId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const msId = process.env.MS_CLIENT_ID?.trim();
  const msSecret = process.env.MS_CLIENT_SECRET?.trim();
  const calendlyId = process.env.CALENDLY_CLIENT_ID?.trim();
  const calendlySecret = process.env.CALENDLY_CLIENT_SECRET?.trim();
  const acuityId = process.env.ACUITY_CLIENT_ID?.trim();
  const acuitySecret = process.env.ACUITY_CLIENT_SECRET?.trim();
  const squareId = process.env.SQUARE_CLIENT_ID?.trim();
  const squareSecret = process.env.SQUARE_CLIENT_SECRET?.trim();

  return [
    {
      provider: 'google-calendar',
      configured: !!(googleId && googleSecret),
      authPath: '/calendar/google/auth-url',
      callbackUrl: getGoogleCalendarRedirectUri(),
      envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    },
    {
      provider: 'outlook',
      configured: !!(msId && msSecret),
      authPath: '/calendar/outlook/auth-url',
      callbackUrl: getOutlookCalendarRedirectUri(),
      envVars: ['MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_TENANT_ID'],
    },
    {
      provider: 'calendly',
      configured: !!(calendlyId && calendlySecret),
      authPath: '/calendar/calendly/auth-url',
      callbackUrl: getCalendlyRedirectUri(),
      envVars: ['CALENDLY_CLIENT_ID', 'CALENDLY_CLIENT_SECRET'],
    },
    {
      provider: 'acuity',
      configured: !!(acuityId && acuitySecret),
      authPath: '/calendar/acuity/auth-url',
      callbackUrl: getAcuityRedirectUri(),
      envVars: ['ACUITY_CLIENT_ID', 'ACUITY_CLIENT_SECRET'],
    },
    {
      provider: 'square-appointments',
      configured: !!(squareId && squareSecret),
      authPath: '/calendar/square-appointments/auth-url',
      callbackUrl: getSquareRedirectUri(),
      envVars: ['SQUARE_CLIENT_ID', 'SQUARE_CLIENT_SECRET'],
    },
    {
      provider: 'hubspot',
      configured: !!(hubspot.clientId && hubspot.clientSecret),
      authPath: '/integrations/hubspot/auth-url',
      callbackUrl: hubspot.redirectUri,
      envVars: ['HUBSPOT_CLIENT_ID', 'HUBSPOT_CLIENT_SECRET', 'HUBSPOT_OAUTH_SCOPES', 'HUBSPOT_OAUTH_OPTIONAL_SCOPES'],
      scopes: hubspot.scopes,
      optionalScopes: hubspot.optionalScopes,
    },
    {
      provider: 'slack',
      configured: !!(slack.clientId && slack.clientSecret),
      authPath: '/integrations/slack/auth-url',
      callbackUrl: getSlackRedirectUri(),
      envVars: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'],
    },
    {
      provider: 'pipedrive',
      configured: !!(pipedrive.clientId && pipedrive.clientSecret),
      authPath: '/integrations/pipedrive/auth-url',
      callbackUrl: pipedrive.redirectUri,
      envVars: ['PIPEDRIVE_CLIENT_ID', 'PIPEDRIVE_CLIENT_SECRET'],
    },
    {
      provider: 'freshsales',
      configured: !!(freshsales.clientId && freshsales.clientSecret),
      authPath: '/integrations/freshsales/auth-url',
      callbackUrl: freshsales.redirectUri,
      envVars: ['FRESHSALES_CLIENT_ID', 'FRESHSALES_CLIENT_SECRET', 'FRESHSALES_OAUTH_SCOPES'],
      scopes: freshsales.scopes,
    },
    {
      provider: 'zoho',
      configured: !!(zoho.clientId && zoho.clientSecret),
      authPath: '/integrations/zoho/auth-url',
      callbackUrl: zoho.redirectUri,
      envVars: ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET'],
    },
    {
      provider: 'copper',
      configured: !!(copper.clientId && copper.clientSecret),
      authPath: '/integrations/copper/auth-url',
      callbackUrl: copper.redirectUri,
      envVars: ['COPPER_CLIENT_ID', 'COPPER_CLIENT_SECRET'],
    },
    {
      provider: 'clio',
      configured: !!(clio.clientId && clio.clientSecret),
      authPath: '/integrations/clio/auth-url',
      callbackUrl: clio.redirectUri,
      envVars: ['CLIO_CLIENT_ID', 'CLIO_CLIENT_SECRET', 'CLIO_OAUTH_SCOPES'],
      scopes: clio.scopes,
    },
    {
      provider: 'servicetitan',
      configured: !!(servicetitan.clientId && servicetitan.clientSecret),
      authPath: '/integrations/servicetitan/auth-url',
      callbackUrl: servicetitan.redirectUri,
      envVars: ['SERVICETITAN_CLIENT_ID', 'SERVICETITAN_CLIENT_SECRET'],
    },
    {
      provider: 'jobber',
      configured: !!(jobber.clientId && jobber.clientSecret),
      authPath: '/integrations/jobber/auth-url',
      callbackUrl: jobber.redirectUri,
      envVars: ['JOBBER_CLIENT_ID', 'JOBBER_CLIENT_SECRET'],
    },
  ];
}
