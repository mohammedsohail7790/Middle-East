import { logger } from '../logger.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { getPipedriveOAuthConfig } from './oauth-config.js';

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export function pipedriveRefreshTokenFromMetadata(metadata: Record<string, unknown> | null): string | null {
  const token = metadata?.pipedrive_refresh_token;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

async function loadPipedriveMetadata(tenantId: string): Promise<Record<string, unknown> | null> {
  const result = await voiceDb.query(
    `SELECT metadata FROM public.voice_tenants WHERE id = $1`,
    [tenantId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return parseMetadata(row.metadata);
}

export async function persistPipedriveTokens(
  tenantId: string,
  patch: {
    accessToken: string;
    refreshToken?: string | null;
    apiDomain?: string | null;
  }
): Promise<void> {
  const metadataPatch: Record<string, unknown> = {
    pipedrive_enabled: true,
    pipedrive_access_token: patch.accessToken,
  };
  if (patch.refreshToken) {
    metadataPatch.pipedrive_refresh_token = patch.refreshToken;
  }
  if (patch.apiDomain) {
    metadataPatch.pipedrive_api_domain = patch.apiDomain;
  }

  await voiceDb.query(
    `UPDATE public.voice_tenants
     SET metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [tenantId, JSON.stringify(metadataPatch)]
  );
}

export async function refreshPipedriveAccessToken(
  tenantId: string,
  refreshToken: string
): Promise<{ accessToken: string; apiDomain: string }> {
  const config = getPipedriveOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Pipedrive OAuth is not configured on the server');
  }

  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await fetch('https://oauth.pipedrive.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    api_domain?: string;
    error?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error || `Pipedrive token refresh failed (${response.status})`);
  }

  const apiDomain = data.api_domain || 'https://api.pipedrive.com';
  await persistPipedriveTokens(tenantId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    apiDomain,
  });

  logger.info('Pipedrive access token refreshed', { tenantId });
  return { accessToken: data.access_token, apiDomain };
}

function pipedriveApiBase(apiDomain: string): string {
  const domain = (apiDomain || 'https://api.pipedrive.com').replace(/\/$/, '');
  if (domain.includes('api.pipedrive.com')) return 'https://api.pipedrive.com/v1';
  return `${domain}/api/v1`;
}

/** Returns valid Pipedrive OAuth credentials, refreshing when the access token is expired. */
export async function resolvePipedriveAccessToken(
  tenantId: string
): Promise<{ accessToken: string; apiDomain: string } | null> {
  const metadata = await loadPipedriveMetadata(tenantId);
  if (!metadata?.pipedrive_access_token) return null;
  if (metadata.pipedrive_enabled === false) return null;

  const accessToken = String(metadata.pipedrive_access_token);
  const apiDomain = String(metadata.pipedrive_api_domain || 'https://api.pipedrive.com');
  const refreshToken = pipedriveRefreshTokenFromMetadata(metadata);

  const probe = await fetch(`${pipedriveApiBase(apiDomain)}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (probe.ok) {
    return { accessToken, apiDomain };
  }

  if ((probe as unknown as { status: number }).status !== 401) {
    return { accessToken, apiDomain };
  }

  if (!refreshToken) {
    return null;
  }

  return refreshPipedriveAccessToken(tenantId, refreshToken);
}
