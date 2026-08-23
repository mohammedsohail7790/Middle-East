/**
 * OAuth Controller for CRM/Communication Integrations
 * Handles OAuth2 flows for: HubSpot, Slack, Jobber, Freshsales, Zoho, Clio
 * 
 * Pattern: 
 *   1. GET /integrations/:provider/auth-url → returns OAuth consent URL
 *   2. User authorizes in browser
 *   3. Provider redirects to GET /integrations/:provider/callback
 *   4. We exchange code for tokens, store in DB, redirect user back to dashboard
 */

import express from 'express';
import { randomBytes } from 'crypto';
import { logger } from '../logger.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { getTenantId } from '../auth/tenant-context.js';
import { getDashboardBaseUrl, integrationsPageUrl, oauthProviderErrorDetail, readOAuthCallbackParams } from './oauth-redirect.js';

import { publishIntegrationsUpdated } from './integrations-notify.js';
import { scheduleIntegrationSyncForProvider } from './integration-sync.service.js';
import { assertIntegrationPlanAccess } from './integration-plan-access.js';
import { getOAuthCapabilities } from './oauth-capabilities.js';
import {
  getHubSpotOAuthConfig,
  getSlackOAuthConfig,
  getJobberOAuthConfig,
  getFreshsalesOAuthConfig,
  getZohoOAuthConfig,
  getClioOAuthConfig,
} from './oauth-config.js';
import {
  normalizeFreshworksOrgDomain,
  FreshsalesProvider,
  freshsalesOAuthAuthorizeUrl,
  freshsalesOAuthTokenUrls,
} from './providers/freshsales.provider.js';
import { normalizeDataCenter, zohoAccountsHost, dataCenterFromAccountsServer, dataCenterFromLocation } from './providers/zoho.provider.js';
import { connectionStore } from './connection-store.service.js';
import { getProviderAdapter } from './provider-registry.js';
import { clientErrorMessage } from '../../security/safe-error.js';
import { recordOAuthConnectionTested } from './oauth-post-connect.js';
import { JobberProvider } from './providers/jobber.provider.js';
import {
  JOBBER_OAUTH_AUTHORIZE_URL,
  JOBBER_OAUTH_TOKEN_URL,
} from './providers/jobber-api.js';
import { HubSpotProvider } from './providers/hubspot.provider.js';

// ─── State Management (CSRF protection) ─────────────────────────────────────

/** code_verifier column stores dashboard return URL; optional PKCE verifier and org domain are JSON-encoded. */
function encodeOAuthStateExtras(
  dashboardReturnBase: string,
  pkceCodeVerifier?: string,
  orgDomain?: string,
  dataCenter?: string
): string {
  if (pkceCodeVerifier || orgDomain || dataCenter) {
    return JSON.stringify({
      d: dashboardReturnBase,
      ...(pkceCodeVerifier ? { p: pkceCodeVerifier } : {}),
      ...(orgDomain ? { o: orgDomain } : {}),
      ...(dataCenter ? { c: dataCenter } : {}),
    });
  }
  return dashboardReturnBase;
}

function decodeOAuthStateExtras(raw: string | null | undefined): {
  dashboardReturnBase: string;
  pkceCodeVerifier?: string;
  orgDomain?: string;
  dataCenter?: string;
} {
  const value = (raw || '').trim();
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as { d?: string; p?: string; o?: string; c?: string };
      return {
        dashboardReturnBase: parsed.d || getDashboardBaseUrl(),
        pkceCodeVerifier: parsed.p || undefined,
        orgDomain: parsed.o || undefined,
        dataCenter: parsed.c || undefined,
      };
    } catch {
      /* legacy plain string */
    }
  }
  return { dashboardReturnBase: value || getDashboardBaseUrl() };
}

function beginOAuthCallback(
  res: any,
  provider: string,
  query: Record<string, unknown>
): { code: string; state: string } | null {
  const { code, state, oauthError, oauthErrorDescription } = readOAuthCallbackParams(query);
  if (oauthError) {
    res.redirect(
      integrationsPageUrl(
        provider,
        'error',
        undefined,
        oauthProviderErrorDetail(oauthError, oauthErrorDescription)
      )
    );
    return null;
  }
  if (!code || !state) {
    res.redirect(
      integrationsPageUrl(provider, 'error', undefined, 'Missing authorization code — try connecting again')
    );
    return null;
  }
  return { code, state };
}

function redirectInvalidOAuthState(
  res: any,
  provider: string,
  dashboardBase?: string
): void {
  res.redirect(
    integrationsPageUrl(provider, 'error', dashboardBase, 'Session expired — start Connect again')
  );
}

async function storeOAuthState(
  tenantId: string,
  provider: string,
  oauthRedirectUri: string,
  dashboardReturnBase: string,
  pkceCodeVerifier?: string,
  orgDomain?: string,
  dataCenter?: string
): Promise<string> {
  const state = randomBytes(32).toString('hex');
  const stateExtras = encodeOAuthStateExtras(dashboardReturnBase, pkceCodeVerifier, orgDomain, dataCenter);
  try {
    await voiceDb.query(
      `INSERT INTO public.integration_oauth_states (state, tenant_id, provider, redirect_uri, code_verifier, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (state) DO NOTHING`,
      [state, tenantId, provider, oauthRedirectUri, stateExtras]
    );
  } catch (error) {
    const msg = String(error);
    if (/integration_oauth_states|relation.*does not exist/i.test(msg)) {
      throw new Error(
        'OAuth state table missing in Supabase — run migration 003_integration_oauth_and_logs.sql'
      );
    }
    throw error;
  }
  return state;
}

async function verifyOAuthState(
  state: string
): Promise<{
  tenantId: string;
  provider: string;
  dashboardReturnBase: string;
  pkceCodeVerifier?: string;
  orgDomain?: string;
  dataCenter?: string;
} | null> {
  const result = await voiceDb.query(
    `DELETE FROM public.integration_oauth_states 
     WHERE state = $1 AND expires_at > NOW()
     RETURNING tenant_id, provider, code_verifier`,
    [state]
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  const decoded = decodeOAuthStateExtras(row.code_verifier as string);
  return {
    tenantId: row.tenant_id,
    provider: row.provider,
    dashboardReturnBase: decoded.dashboardReturnBase,
    pkceCodeVerifier: decoded.pkceCodeVerifier,
    orgDomain: decoded.orgDomain,
    dataCenter: decoded.dataCenter,
  };
}

// ─── Router ──────────────────────────────────────────────────────────────────

async function denyIfPlanBlocked(
  req: express.Request,
  res: express.Response,
  integrationId: string,
  tenantId: string
): Promise<boolean> {
  const gate = await assertIntegrationPlanAccess(tenantId, integrationId);
  if (gate.ok === false) {
    res.status(gate.status).json({ success: false, error: gate.error, currentPlan: gate.currentPlan });
    return true;
  }
  return false;
}

export function createIntegrationOAuthRouter(): express.Router {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));

  router.get('/oauth-health', (_req: any, res: any) => {
    res.json({ success: true, data: getOAuthCapabilities() });
  });

  router.get('/oauth-capabilities', requireVoiceApiAccess, (_req: any, res: any) => {
    res.json({ success: true, data: getOAuthCapabilities() });
  });

  // ═══ HubSpot OAuth ═══

  router.get('/hubspot/auth-url', requireVoiceApiAccess, async (req: any, res: any) => {
    try {
      const tenantId = getTenantId(req);
      if (await denyIfPlanBlocked(req, res, 'hubspot', tenantId)) return;
      const config = getHubSpotOAuthConfig();
      if (!config.clientId || !config.clientSecret) {
        return res.status(501).json({ success: false, error: 'HubSpot OAuth not configured' });
      }

      const state = await storeOAuthState(
        tenantId,
        'hubspot',
        config.redirectUri,
        getDashboardBaseUrl()
      );
      const scopeParam = encodeURIComponent(config.scopes.join(' '));
      let url =
        `https://app.hubspot.com/oauth/authorize?client_id=${config.clientId}` +
        `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
        `&scope=${scopeParam}` +
        `&state=${state}`;
      if (config.optionalScopes.length > 0) {
        url += `&optional_scope=${encodeURIComponent(config.optionalScopes.join(' '))}`;
      }

      res.json({
        success: true,
        data: { authUrl: url, scopes: config.scopes, optionalScopes: config.optionalScopes },
      });
    } catch (error) {
      logger.error('HubSpot auth-url failed', { error: String(error) });
      res.status(500).json({ success: false, error: clientErrorMessage(error, 'OAuth request failed') });
    }
  });

  router.get('/hubspot/callback', async (req: any, res: any) => {
    const { code, state, error, error_description: oauthErrorDescription } = req.query;
    if (error) {
      const detail = String(oauthErrorDescription || error);
      return res.redirect(integrationsPageUrl('hubspot', 'error', undefined, detail));
    }
    if (!code || !state) return res.status(400).send('Missing code or state');

    const verified = await verifyOAuthState(state as string);
    if (!verified) return res.status(403).send('Invalid or expired state');

    try {
      const config = getHubSpotOAuthConfig();
      const tokenRes = await fetch('https://api.hubapi.com/oauth/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          code: code as string,
        }),
      });
      const tokens = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        hub_id?: number;
        message?: string;
      };

      if (!tokenRes.ok || !tokens.access_token) {
        const detail = tokens.message || 'Token exchange failed';
        logger.error('HubSpot OAuth token exchange failed', { error: tokens });
        return res.redirect(
          integrationsPageUrl('hubspot', 'error', verified.dashboardReturnBase, detail)
        );
      }

      const hubspotCreds = {
        apiKey: tokens.access_token,
        portalId: tokens.hub_id?.toString() || '',
      };
      const verifyRes = await fetch('https://api.hubapi.com/account-info/v3/details', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!verifyRes.ok) {
        const detail = `HubSpot API verification failed (${verifyRes.status})`;
        logger.error('HubSpot OAuth verify failed', { status: verifyRes.status });
        return res.redirect(
          integrationsPageUrl('hubspot', 'error', verified.dashboardReturnBase, detail)
        );
      }

      const hubspot = new HubSpotProvider();
      const testPayload = {
        callId: `oauth-test-${Date.now()}`,
        type: 'lead' as const,
        lead: {
          name: 'Test Lead (Call IQ)',
          phone: '+15551234567',
          email: 'test-lead@calliq.example',
          service: 'Connection test',
          notes: 'OAuth connection test from Call IQ.',
        },
      };
      try {
        await hubspot.sendLead(hubspotCreds, testPayload);
      } catch (testErr) {
        const detail = testErr instanceof Error ? testErr.message : 'Test lead failed';
        logger.error('HubSpot OAuth test lead failed', { error: String(testErr) });
        return res.redirect(
          integrationsPageUrl('hubspot', 'error', verified.dashboardReturnBase, detail)
        );
      }

      await voiceDb.query(
        `UPDATE public.voice_tenants
         SET hubspot_enabled = true,
             hubspot_api_key = $2,
             hubspot_portal_id = $3,
             metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
         WHERE id = $1`,
        [
          verified.tenantId,
          tokens.access_token,
          tokens.hub_id?.toString() || null,
          JSON.stringify({
            ...(tokens.refresh_token ? { hubspot_refresh_token: tokens.refresh_token } : {}),
          }),
        ]
      );

      await recordOAuthConnectionTested(
        verified.tenantId,
        'hubspot',
        hubspotCreds,
        'HubSpot connected and test contact/deal created'
      );

      logger.info('HubSpot OAuth connected', { tenantId: verified.tenantId });
      publishIntegrationsUpdated(verified.tenantId, 'hubspot');
      scheduleIntegrationSyncForProvider(verified.tenantId, 'hubspot');
      res.redirect(integrationsPageUrl('hubspot', 'connected', verified.dashboardReturnBase));
    } catch (error) {
      logger.error('HubSpot OAuth callback error', { error: String(error) });
      res.redirect(integrationsPageUrl('hubspot', 'error'));
    }
  });

  // ═══ Slack OAuth ═══

  router.get('/slack/auth-url', requireVoiceApiAccess, async (req: any, res: any) => {
    try {
      const tenantId = getTenantId(req);
      if (await denyIfPlanBlocked(req, res, 'slack', tenantId)) return;
      const config = getSlackOAuthConfig();
      if (!config.clientId || !config.clientSecret) {
        return res.status(501).json({ success: false, error: 'Slack OAuth not configured' });
      }

      const state = await storeOAuthState(
        tenantId,
        'slack',
        config.redirectUri,
        getDashboardBaseUrl()
      );
      const scopes = config.scopes.join(',');
      const url =
        `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(config.clientId)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
        `&state=${encodeURIComponent(state)}`;

      res.json({ success: true, data: { authUrl: url } });
    } catch (error) {
      logger.error('Slack auth-url failed', { error: String(error) });
      res.status(500).json({ success: false, error: clientErrorMessage(error, 'OAuth request failed') });
    }
  });

  router.get('/slack/callback', async (req: any, res: any) => {
    const started = beginOAuthCallback(res, 'slack', req.query as Record<string, unknown>);
    if (!started) return;

    const { code, state } = started;
    const verified = await verifyOAuthState(state);
    if (!verified) {
      redirectInvalidOAuthState(res, 'slack');
      return;
    }

    try {
      const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: getSlackOAuthConfig().clientId,
          client_secret: getSlackOAuthConfig().clientSecret,
          code,
          redirect_uri: getSlackOAuthConfig().redirectUri,
        }),
      });
      const data = await tokenRes.json() as any;

      if (!data.ok) {
        logger.error('Slack OAuth failed', { error: data.error });
        return res.redirect(
          integrationsPageUrl(
            'slack',
            'error',
            verified.dashboardReturnBase,
            oauthProviderErrorDetail(data.error)
          )
        );
      }

      // Store the incoming webhook URL (user must pick a channel during OAuth)
      const webhookUrl = data.incoming_webhook?.url;
      const channel = data.incoming_webhook?.channel || '#general';

      if (!webhookUrl) {
        return res.redirect(
          integrationsPageUrl(
            'slack',
            'error',
            verified.dashboardReturnBase,
            'Pick a Slack channel on the Allow screen — incoming webhook is required for notifications'
          )
        );
      }

      await voiceDb.query(
        `INSERT INTO public.slack_connections (tenant_id, webhook_url, channel, access_token, team_name, enabled)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (tenant_id) DO UPDATE SET
           webhook_url = EXCLUDED.webhook_url,
           channel = EXCLUDED.channel,
           access_token = EXCLUDED.access_token,
           team_name = EXCLUDED.team_name,
           enabled = true,
           updated_at = NOW()`,
        [
          verified.tenantId,
          webhookUrl,
          channel,
          data.access_token || null,
          data.team?.name || '',
        ]
      );

      logger.info('Slack OAuth connected', { tenantId: verified.tenantId, channel });
      publishIntegrationsUpdated(verified.tenantId, 'slack');
      res.redirect(integrationsPageUrl('slack', 'connected', verified.dashboardReturnBase));
    } catch (error) {
      logger.error('Slack OAuth callback error', { error: String(error) });
      const msg = String(error);
      const detail =
        /slack_connections|foreign key|column.*does not exist|no unique|ON CONFLICT/i.test(msg)
          ? 'Slack database setup incomplete — in Supabase SQL Editor run migration 051_slack_connections_ensure.sql, then retry Connect'
          : clientErrorMessage(error, 'Slack connection failed');
      res.redirect(
        integrationsPageUrl(
          'slack',
          'error',
          verified.dashboardReturnBase,
          detail
        )
      );
    }
  });

  // ═══ Jobber OAuth ═══

  router.get('/jobber/auth-url', requireVoiceApiAccess, async (req: any, res: any) => {
    const tenantId = getTenantId(req);
    if (await denyIfPlanBlocked(req, res, 'jobber', tenantId)) return;
    if (!getJobberOAuthConfig().clientId) return res.status(501).json({ success: false, error: 'Jobber OAuth not configured' });

    const state = await storeOAuthState(
      tenantId,
      'jobber',
      getJobberOAuthConfig().redirectUri,
      getDashboardBaseUrl()
    );
    const redirectUri = getJobberOAuthConfig().redirectUri;
    const url =
      `${JOBBER_OAUTH_AUTHORIZE_URL}?client_id=${encodeURIComponent(getJobberOAuthConfig().clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(state)}`;

    res.json({ success: true, data: { authUrl: url, redirectUri } });
  });

  router.get('/jobber/callback', async (req: any, res: any) => {
    const started = beginOAuthCallback(res, 'jobber', req.query as Record<string, unknown>);
    if (!started) return;

    const { code, state } = started;
    const verified = await verifyOAuthState(state);
    if (!verified) {
      redirectInvalidOAuthState(res, 'jobber');
      return;
    }

    try {
      const redirectUri = getJobberOAuthConfig().redirectUri;
      const tokenRes = await fetch(JOBBER_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: getJobberOAuthConfig().clientId,
          client_secret: getJobberOAuthConfig().clientSecret,
          redirect_uri: redirectUri,
          code: code as string,
        }),
      });
      const tokenText = await tokenRes.text();
      let tokens: { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
      try {
        tokens = tokenText ? (JSON.parse(tokenText) as typeof tokens) : {};
      } catch {
        tokens = {};
      }

      if (!tokenRes.ok) {
        const tokenHttpStatus = (tokenRes as unknown as { status: number }).status;
        const detail =
          oauthProviderErrorDetail(tokens.error, tokens.error_description) ||
          (tokenHttpStatus === 404
            ? 'Jobber token endpoint returned 404 — check JOBBER_CLIENT_ID/SECRET and callback URL in the Jobber Developer Center.'
            : `Jobber token error (HTTP ${tokenHttpStatus})`);
        return res.redirect(
          integrationsPageUrl('jobber', 'error', verified.dashboardReturnBase, detail)
        );
      }

      const accessToken = String(tokens.access_token || '');
      if (!accessToken) {
        return res.redirect(
          integrationsPageUrl('jobber', 'error', verified.dashboardReturnBase, 'Jobber did not return an access token')
        );
      }

      const jobber = new JobberProvider();
      const verifyResult = await jobber.verifyConnection({ apiToken: accessToken, accountId: '' });
      if (!verifyResult.success) {
        logger.error('Jobber OAuth verify failed after token exchange', { message: verifyResult.message });
        return res.redirect(
          integrationsPageUrl('jobber', 'error', verified.dashboardReturnBase, verifyResult.message)
        );
      }

      await voiceDb.query(
        `UPDATE public.voice_tenants
         SET jobber_enabled = true,
             jobber_api_token = $2,
             jobber_account_id = coalesce(nullif($3, ''), jobber_account_id)
         WHERE id = $1`,
        [verified.tenantId, accessToken, verifyResult.accountId || '']
      );
      if (tokens.refresh_token) {
        await voiceDb.query(
          `UPDATE public.voice_tenants
           SET metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb, updated_at = now()
           WHERE id = $1`,
          [verified.tenantId, JSON.stringify({ jobber_refresh_token: tokens.refresh_token })]
        );
      }

      const testResult = await jobber.sendTestLead({
        apiToken: accessToken,
        accountId: verifyResult.accountId || '',
      });
      if (!testResult.success) {
        logger.error('Jobber OAuth test lead failed', { message: testResult.message });
        return res.redirect(
          integrationsPageUrl('jobber', 'error', verified.dashboardReturnBase, testResult.message)
        );
      }

      await recordOAuthConnectionTested(
        verified.tenantId,
        'jobber',
        { apiToken: accessToken, accountId: verifyResult.accountId || '' },
        testResult.message
      );

      publishIntegrationsUpdated(verified.tenantId, 'jobber');
      res.redirect(integrationsPageUrl('jobber', 'connected', verified.dashboardReturnBase));
    } catch (error) {
      logger.error('Jobber OAuth callback error', { error: String(error) });
      res.redirect(integrationsPageUrl('jobber', 'error'));
    }
  });

  // ═══ Freshsales OAuth ═══

  router.get('/freshsales/auth-url', requireVoiceApiAccess, async (req: any, res: any) => {
    const tenantId = getTenantId(req);
    if (await denyIfPlanBlocked(req, res, 'freshsales', tenantId)) return;

    const config = getFreshsalesOAuthConfig();
    if (!config.clientId || !config.clientSecret) {
      return res.status(501).json({ success: false, error: 'Freshsales OAuth not configured' });
    }

    const domainInput = String(req.query.domain || '').trim();
    if (!domainInput) {
      return res.status(400).json({
        success: false,
        error: 'Freshsales organization domain is required (e.g. acme.myfreshworks.com)',
      });
    }

    const orgDomain = normalizeFreshworksOrgDomain(domainInput);
    const state = await storeOAuthState(
      tenantId,
      'freshsales',
      config.redirectUri,
      getDashboardBaseUrl(),
      undefined,
      orgDomain
    );
    const url = freshsalesOAuthAuthorizeUrl(orgDomain, {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      scope: config.scopes.join(' '),
    });

    res.json({ success: true, data: { authUrl: url, orgDomain, scopes: config.scopes } });
  });

  router.get('/freshsales/callback', async (req: any, res: any) => {
    const { code, state, error, error_description: oauthErrorDescription } = req.query;
    if (error) {
      const detail = String(oauthErrorDescription || error);
      return res.redirect(integrationsPageUrl('freshsales', 'error', undefined, detail));
    }
    if (!code || !state) return res.status(400).send('Missing code or state');

    const verified = await verifyOAuthState(state as string);
    if (!verified) return res.status(403).send('Invalid or expired state');

    const orgDomain = verified.orgDomain;
    if (!orgDomain) {
      logger.error('Freshsales OAuth callback missing org domain in state');
      return res.redirect(integrationsPageUrl('freshsales', 'error', verified.dashboardReturnBase));
    }

    try {
      const config = getFreshsalesOAuthConfig();
      const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: config.redirectUri,
      });

      let tokens: {
        access_token?: string;
        refresh_token?: string;
        error?: string;
        error_description?: string;
      } | null = null;
      let tokenOk = false;

      for (const tokenUrl of freshsalesOAuthTokenUrls(orgDomain)) {
        const tokenRes = (await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
          body,
        })) as globalThis.Response;
        const payload = (await tokenRes.json()) as typeof tokens;
        if (tokenRes.ok && payload?.access_token) {
          tokens = payload;
          tokenOk = true;
          break;
        }
        const tokenHttpStatus = (tokenRes as unknown as { status: number }).status;
        if (tokenHttpStatus !== 404) {
          tokens = payload;
          break;
        }
      }

      if (!tokenOk || !tokens?.access_token) {
        const detail = tokens?.error_description || tokens?.error || 'Token exchange failed';
        logger.error('Freshsales OAuth token exchange failed', { error: tokens, orgDomain });
        return res.redirect(
          integrationsPageUrl('freshsales', 'error', verified.dashboardReturnBase, detail)
        );
      }

      const subdomain = orgDomain.replace(/\.myfreshworks\.com$/i, '');
      const freshsalesCreds = {
        accessToken: tokens.access_token,
        orgDomain,
        domain: subdomain,
        apiBaseUrl: `https://${orgDomain}/crm/sales/api`,
      };
      const freshsales = new FreshsalesProvider();
      const verifyResult = await freshsales.verifyConnection(freshsalesCreds);
      if (!verifyResult.success) {
        logger.error('Freshsales OAuth verify failed', { message: verifyResult.message, orgDomain });
        return res.redirect(
          integrationsPageUrl('freshsales', 'error', verified.dashboardReturnBase, verifyResult.message)
        );
      }

      const testResult = await freshsales.sendTestLead(freshsalesCreds);
      if (!testResult.success) {
        logger.error('Freshsales OAuth test contact failed', { message: testResult.message, orgDomain });
        return res.redirect(
          integrationsPageUrl('freshsales', 'error', verified.dashboardReturnBase, testResult.message)
        );
      }

      await voiceDb.query(
        `UPDATE public.voice_tenants
         SET metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb
         WHERE id = $1`,
        [
          verified.tenantId,
          JSON.stringify({
            freshsales_enabled: true,
            freshsales_access_token: tokens.access_token,
            freshsales_refresh_token: tokens.refresh_token || null,
            freshsales_org_domain: orgDomain,
            freshsales_domain: subdomain,
            freshsales_api_base: `https://${orgDomain}/crm/sales/api`,
            freshsales_api_key: null,
          }),
        ]
      );

      await recordOAuthConnectionTested(verified.tenantId, 'freshsales', freshsalesCreds, testResult.message);

      logger.info('Freshsales OAuth connected', { tenantId: verified.tenantId, orgDomain });
      publishIntegrationsUpdated(verified.tenantId, 'freshsales');
      scheduleIntegrationSyncForProvider(verified.tenantId, 'freshsales');
      res.redirect(integrationsPageUrl('freshsales', 'connected', verified.dashboardReturnBase));
    } catch (error) {
      logger.error('Freshsales OAuth callback error', { error: String(error) });
      res.redirect(integrationsPageUrl('freshsales', 'error'));
    }
  });

  // ═══ Zoho CRM OAuth ═══

  router.get('/zoho/auth-url', requireVoiceApiAccess, async (req: any, res: any) => {
    const tenantId = getTenantId(req);
    if (await denyIfPlanBlocked(req, res, 'zoho', tenantId)) return;

    const config = getZohoOAuthConfig();
    if (!config.clientId || !config.clientSecret) {
      return res.status(501).json({ success: false, error: 'Zoho OAuth not configured' });
    }

    const dataCenterInput = String(req.query.dataCenter || '').trim();
    if (!dataCenterInput) {
      return res.status(400).json({
        success: false,
        error: 'Zoho data center is required (e.g. com, eu, in)',
      });
    }
    const dataCenter = normalizeDataCenter(dataCenterInput);

    const state = await storeOAuthState(
      tenantId,
      'zoho',
      config.redirectUri,
      getDashboardBaseUrl(),
      undefined,
      undefined,
      dataCenter
    );
    const scope = encodeURIComponent(config.scopes.join(','));
    const url =
      `${zohoAccountsHost(dataCenter)}/oauth/v2/auth` +
      `?scope=${scope}` +
      `&client_id=${encodeURIComponent(config.clientId)}` +
      `&response_type=code` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    res.json({ success: true, data: { authUrl: url } });
  });

  router.get('/zoho/callback', async (req: any, res: any) => {
    const started = beginOAuthCallback(res, 'zoho', req.query as Record<string, unknown>);
    if (!started) return;

    const { code, state } = started;
    const verified = await verifyOAuthState(state);
    if (!verified) {
      redirectInvalidOAuthState(res, 'zoho');
      return;
    }

    const dataCenterFromState = verified.dataCenter;
    if (!dataCenterFromState) {
      logger.error('Zoho OAuth callback missing data center in state');
      return res.redirect(
        integrationsPageUrl(
          'zoho',
          'error',
          verified.dashboardReturnBase,
          'Zoho data center was lost — reconnect and choose your region (com, eu, in, etc.)'
        )
      );
    }

    const query = req.query as Record<string, unknown>;
    const accountsServerRaw =
      (typeof query['accounts-server'] === 'string' && query['accounts-server'].trim()) ||
      (typeof query.accounts_server === 'string' && query.accounts_server.trim()) ||
      '';
    const locationRaw = typeof query.location === 'string' ? query.location.trim() : '';

    const resolvedDataCenter =
      (locationRaw ? dataCenterFromLocation(locationRaw) : '') ||
      (accountsServerRaw ? dataCenterFromAccountsServer(accountsServerRaw) : '') ||
      dataCenterFromState;
    const accountsServer = accountsServerRaw || zohoAccountsHost(resolvedDataCenter);

    try {
      const config = getZohoOAuthConfig();
      const tokenRes = await fetch(`${accountsServer.replace(/\/$/, '')}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          code,
        }),
      });
      const tokens = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        api_domain?: string;
        error?: string;
      };

      if (!tokenRes.ok || !tokens.refresh_token) {
        logger.error('Zoho OAuth token exchange failed', {
          error: tokens,
          dataCenter: resolvedDataCenter,
          accountsServer,
        });
        return res.redirect(
          integrationsPageUrl(
            'zoho',
            'error',
            verified.dashboardReturnBase,
            oauthProviderErrorDetail(tokens.error)
          )
        );
      }

      const credentials = {
        dataCenter: resolvedDataCenter,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token || undefined,
        apiDomain: tokens.api_domain || undefined,
        accountsServer: accountsServer.replace(/\/$/, ''),
      };

      const adapter = getProviderAdapter('zoho');
      const verifyResult = adapter
        ? await adapter.verifyConnection(credentials)
        : { success: false, message: 'Zoho provider not available' };
      if (!verifyResult.success) {
        logger.error('Zoho OAuth verify failed after token exchange', { message: verifyResult.message });
        return res.redirect(
          integrationsPageUrl('zoho', 'error', verified.dashboardReturnBase, verifyResult.message)
        );
      }

      const testResult = adapter
        ? await adapter.sendTest(credentials)
        : { success: false, message: 'Zoho provider not available' };
      if (!testResult.success) {
        logger.error('Zoho OAuth test lead failed', { message: testResult.message });
        return res.redirect(
          integrationsPageUrl('zoho', 'error', verified.dashboardReturnBase, testResult.message)
        );
      }

      await connectionStore.upsertConnection(verified.tenantId, 'zoho', 'oauth', credentials, {
        status: 'connected',
      });
      await connectionStore.markTested(verified.tenantId, 'zoho', true);
      await connectionStore.appendLog(
        verified.tenantId,
        'zoho',
        'connect',
        'info',
        testResult.message
      );

      logger.info('Zoho OAuth connected', { tenantId: verified.tenantId, dataCenter: resolvedDataCenter });
      publishIntegrationsUpdated(verified.tenantId, 'zoho');
      scheduleIntegrationSyncForProvider(verified.tenantId, 'zoho');
      res.redirect(integrationsPageUrl('zoho', 'connected', verified.dashboardReturnBase));
    } catch (error) {
      logger.error('Zoho OAuth callback error', { error: String(error) });
      res.redirect(
        integrationsPageUrl(
          'zoho',
          'error',
          verified.dashboardReturnBase,
          clientErrorMessage(error, 'Zoho connection failed')
        )
      );
    }
  });

  // ═══ Clio OAuth ═══

  router.get('/clio/auth-url', requireVoiceApiAccess, async (req: any, res: any) => {
    const tenantId = getTenantId(req);
    if (await denyIfPlanBlocked(req, res, 'clio', tenantId)) return;

    const config = getClioOAuthConfig();
    if (!config.clientId || !config.clientSecret) {
      return res.status(501).json({ success: false, error: 'Clio OAuth not configured' });
    }

    const state = await storeOAuthState(tenantId, 'clio', config.redirectUri, getDashboardBaseUrl());
    const scopeParam = config.scopes.length > 0 ? `&scope=${encodeURIComponent(config.scopes.join(' '))}` : '';
    const url =
      'https://app.clio.com/oauth/authorize' +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(config.clientId)}` +
      `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
      scopeParam +
      `&state=${encodeURIComponent(state)}` +
      `&redirect_on_decline=true`;

    res.json({ success: true, data: { authUrl: url } });
  });

  router.get('/clio/callback', async (req: any, res: any) => {
    const started = beginOAuthCallback(res, 'clio', req.query as Record<string, unknown>);
    if (!started) return;

    const { code, state } = started;
    const verified = await verifyOAuthState(state);
    if (!verified) {
      redirectInvalidOAuthState(res, 'clio');
      return;
    }

    try {
      const config = getClioOAuthConfig();
      const tokenRes = await fetch('https://app.clio.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.redirectUri,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
      });
      const tokens = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        error?: string;
        error_description?: string;
      };

      if (!tokenRes.ok || !tokens.access_token || !tokens.refresh_token) {
        logger.error('Clio OAuth token exchange failed', { error: tokens });
        return res.redirect(
          integrationsPageUrl(
            'clio',
            'error',
            verified.dashboardReturnBase,
            oauthProviderErrorDetail(tokens.error, tokens.error_description)
          )
        );
      }

      const credentials = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      };
      const adapter = getProviderAdapter('clio');
      const verifyResult = adapter
        ? await adapter.verifyConnection(credentials)
        : { success: false, message: 'Clio provider not available' };
      if (!verifyResult.success) {
        logger.error('Clio OAuth verify failed after token exchange', { message: verifyResult.message });
        return res.redirect(
          integrationsPageUrl('clio', 'error', verified.dashboardReturnBase, verifyResult.message)
        );
      }

      const testResult = adapter
        ? await adapter.sendTest(credentials)
        : { success: false, message: 'Clio provider not available' };
      if (!testResult.success) {
        logger.error('Clio OAuth test lead failed', { message: testResult.message });
        return res.redirect(
          integrationsPageUrl('clio', 'error', verified.dashboardReturnBase, testResult.message)
        );
      }

      await connectionStore.upsertConnection(verified.tenantId, 'clio', 'oauth', credentials, {
        status: 'connected',
      });
      await connectionStore.markTested(verified.tenantId, 'clio', true);
      await connectionStore.appendLog(verified.tenantId, 'clio', 'connect', 'info', testResult.message);

      logger.info('Clio OAuth connected', { tenantId: verified.tenantId });
      publishIntegrationsUpdated(verified.tenantId, 'clio');
      scheduleIntegrationSyncForProvider(verified.tenantId, 'clio');
      res.redirect(integrationsPageUrl('clio', 'connected', verified.dashboardReturnBase));
    } catch (error) {
      logger.error('Clio OAuth callback error', { error: String(error) });
      res.redirect(
        integrationsPageUrl(
          'clio',
          'error',
          verified.dashboardReturnBase,
          clientErrorMessage(error, 'Clio connection failed')
        )
      );
    }
  });

  router.post('/clio/deauthorize', express.json(), async (req: any, res: any) => {
    logger.info('Clio deauthorization callback received', {
      clientId: req.body?.client_id,
      userId: req.body?.user_id,
    });
    res.sendStatus(200);
  });

  return router;
}
