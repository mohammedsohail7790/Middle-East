/** Map snake_case DB rows to camelCase calendar connection objects. */
export function mapGoogleCalendarConnectionRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    provider: 'google' as const,
    email: String(row.email || ''),
    accessToken: String(row.access_token || ''),
    refreshToken: String(row.refresh_token || ''),
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
