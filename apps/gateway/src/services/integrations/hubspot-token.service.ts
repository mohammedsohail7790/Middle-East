import { logger } from '../logger.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { getHubSpotOAuthConfig } from './oauth-config.js';

export type HubSpotTokenRow = {
  hubspot_enabled: boolean;
  hubspot_api_key: string | null;
  hubspot_portal_id: string | null;
  metadata: Record<string, unknown> | null;
};

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export function hubspotRefreshTokenFromMetadata(metadata: Record<string, unknown> | null): string | null {
  const token = metadata?.hubspot_refresh_token;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

export async function loadHubSpotTokenRow(tenantId: string): Promise<HubSpotTokenRow | null> {
  const result = await voiceDb.query(
    `SELECT hubspot_enabled, hubspot_api_key, hubspot_portal_id, metadata
     FROM public.voice_tenants WHERE id = $1`,
    [tenantId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    hubspot_enabled: !!row.hubspot_enabled,
    hubspot_api_key: row.hubspot_api_key ?? null,
    hubspot_portal_id: row.hubspot_portal_id ?? null,
    metadata: parseMetadata(row.metadata),
  };
}

async function persistHubSpotTokens(
  tenantId: string,
  accessToken: string,
  refreshToken: string | null,
  portalId?: string | null
): Promise<void> {
  const metadataPatch: Record<string, unknown> = {};
  if (refreshToken) {
    metadataPatch.hubspot_refresh_token = refreshToken;
  }

  await voiceDb.query(
    `UPDATE public.voice_tenants
     SET hubspot_api_key = $2,
         hubspot_portal_id = COALESCE($3, hubspot_portal_id),
         metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [tenantId, accessToken, portalId ?? null, JSON.stringify(metadataPatch)]
  );
}

export async function refreshHubSpotAccessToken(
  tenantId: string,
  refreshToken: string
): Promise<string> {
  const config = getHubSpotOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('HubSpot OAuth is not configured on the server');
  }

  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    hub_id?: number;
    message?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.message || `HubSpot token refresh failed (${response.status})`);
  }

  await persistHubSpotTokens(
    tenantId,
    data.access_token,
    data.refresh_token || refreshToken,
    data.hub_id?.toString() || null
  );

  logger.info('HubSpot access token refreshed', { tenantId });
  return data.access_token;
}

/** Returns a valid HubSpot OAuth access token, refreshing when possible. */
export async function resolveHubSpotAccessToken(
  tenantId: string
): Promise<{ accessToken: string; portalId: string } | null> {
  const row = await loadHubSpotTokenRow(tenantId);
  if (!row?.hubspot_enabled || !row.hubspot_api_key) return null;

  const refreshToken = hubspotRefreshTokenFromMetadata(row.metadata);
  if (!refreshToken) {
    return {
      accessToken: row.hubspot_api_key,
      portalId: row.hubspot_portal_id || '',
    };
  }

  const probe = await fetch('https://api.hubapi.com/account-info/v3/details', {
    headers: { Authorization: `Bearer ${row.hubspot_api_key}` },
  });

  if (probe.ok) {
    return {
      accessToken: row.hubspot_api_key,
      portalId: row.hubspot_portal_id || '',
    };
  }

  if ((probe as unknown as { status: number }).status !== 401) {
    return {
      accessToken: row.hubspot_api_key,
      portalId: row.hubspot_portal_id || '',
    };
  }

  const accessToken = await refreshHubSpotAccessToken(tenantId, refreshToken);
  return {
    accessToken,
    portalId: row.hubspot_portal_id || '',
  };
}
