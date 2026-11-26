import { decryptGoogleTokenOrEmpty } from './google-token-crypto.js';

/** Map snake_case DB rows to camelCase calendar connection objects. Google tokens are decrypted here (old plain-text rows pass through). */
export function mapGoogleCalendarConnectionRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    provider: 'google' as const,
    email: String(row.email || ''),
    accessToken: decryptGoogleTokenOrEmpty(row.access_token as string | null | undefined),
    refreshToken: decryptGoogleTokenOrEmpty(row.refresh_token as string | null | undefined),
    expiresAt: new Date(String(row.expires_at || Date.now())),
    status: (String(row.status || 'active') as 'active' | 'expired' | 'error'),
  };
}

export function mapOutlookCalendarConnectionRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    email: String(row.email || ''),
    accessToken: String(row.access_token || ''),
    refreshToken: String(row.refresh_token || ''),
    expiresAt: new Date(String(row.expires_at || Date.now())),
    status: (String(row.status || 'active') as 'active' | 'expired' | 'error'),
  };
}
