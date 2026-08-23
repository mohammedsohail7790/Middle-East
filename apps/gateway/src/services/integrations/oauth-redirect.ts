const PRODUCTION_DASHBOARD = 'https://www.hallaai.com';

/** Production dashboard base URL (Vercel). Set DASHBOARD_URL on Render gateway. */
export function getDashboardBaseUrl(): string {
  let url =
    process.env.DASHBOARD_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    PRODUCTION_DASHBOARD;
  url = url.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/i.test(url)) {
    return PRODUCTION_DASHBOARD;
  }
  return url;
}

export function integrationsPageUrl(
  provider: string,
  status: 'connected' | 'error',
  dashboardBase?: string,
  message?: string
): string {
  const base = (dashboardBase || getDashboardBaseUrl()).replace(/\/$/, '');
  const params = new URLSearchParams({ provider, status });
  if (message?.trim()) {
    params.set('message', message.trim().slice(0, 240));
  }
  return `${base}/dashboard/integrations?${params.toString()}`;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readOAuthCallbackParams(query: Record<string, unknown>): {
  code?: string;
  state?: string;
  oauthError?: string;
  oauthErrorDescription?: string;
} {
  return {
    code: queryString(query.code),
    state: queryString(query.state),
    oauthError: queryString(query.error),
    oauthErrorDescription: queryString(query.error_description),
  };
}

/** Map provider OAuth errors to actionable dashboard messages. */
export function oauthProviderErrorDetail(error?: string, errorDescription?: string): string {
  const raw = (errorDescription || error || '').trim();
  if (!raw) return 'Authorization was denied or failed';
  if (/invalid_team_for_non_distributed_app/i.test(raw)) {
    return 'Slack app must be publicly distributed — in api.slack.com open your app, Manage Distribution, then Activate';
  }
  if (/invalid_scope|invalid_scopes/i.test(raw)) {
    return 'Slack OAuth scopes mismatch — in api.slack.com → OAuth & Permissions add bot scopes: incoming-webhook and chat:write';
  }
  if (/redirect_uri_mismatch|invalid_redirect_uri/i.test(raw)) {
    return 'Slack redirect URL mismatch — add https://gateway.hallaai.com/api/v1/integrations/slack/callback under OAuth & Permissions → Redirect URLs';
  }
  if (/access_denied|user_denied/i.test(raw)) {
    return 'Slack authorization was cancelled — click Connect again and choose Allow';
  }
  if (/don.?t have access to CRM|cannot grant these permissions|permission to share your data/i.test(raw)) {
    return (
      'Your Zoho sign-in cannot access CRM — use a Zoho CRM Administrator account, or in Halla AI choose ' +
      '"Connect with refresh token instead" and paste tokens from Zoho API Console → Self Client'
    );
  }
  if (/no_org/i.test(raw)) {
    return (
      'Your Zoho account has no CRM organization — open crm.zoho.com and create or join a CRM org first. ' +
      'Or use "Connect with refresh token instead" in Halla AI: Self Client → Generate Code → pick your CRM org when prompted.'
    );
  }
  if (/AADSTS50020/i.test(raw)) {
    return 'Personal Microsoft accounts are blocked — in Azure Portal set Supported account types to personal + work accounts, keep MS_TENANT_ID=common on Render, then retry';
  }
  if (/invalid.*permissions|permissions are invalid/i.test(raw)) {
    return 'OAuth scopes mismatch — in Freshworks Developer Portal enable freshsales.contacts.create, contacts.edit, and selectors.view, then set FRESHSALES_OAUTH_SCOPES to match';
  }
  if (/cross-org oauth flows are not supported/i.test(raw)) {
    return (
      'Salesforce External Client Apps only work in the org where they were created — paste YOUR Consumer Key/Secret ' +
      'from Setup → External Client App Manager (Local app in your org), sign in to that same org, then Connect. ' +
      'Callback: https://gateway.hallaai.com/api/v1/integrations/salesforce/callback'
    );
  }
  if (/external client app is not installed|OAUTH_EC_APP_NOT_FOUND/i.test(raw)) {
    return (
      'Salesforce External Client App is not authorized — open your app in External Client App Manager → Policies, ' +
      'set Permitted Users to All users may self-authorize, enable Authorization Code flow + PKCE, then retry'
    );
  }
  if (/app is not found|invalid_client/i.test(raw)) {
    return 'OAuth app not found — verify CLIENT_ID matches the developer portal app and the callback URL is registered exactly';
  }
  return raw.slice(0, 240);
}
