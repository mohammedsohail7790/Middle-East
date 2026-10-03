/**
 * Default-deny route policy for tenant API keys (`Authorization: Bearer sk_calliq_…`).
 *
 * A tenant API key may ONLY reach a route that is listed here, and only with
 * the listed scope. Anything unlisted is rejected — there is no allow-all
 * fallback. Dashboard/Supabase user JWTs are unaffected (this policy is only
 * consulted for the `tenant_api_key` credential type).
 *
 * To expose another route to API keys: add one entry with the narrowest scope.
 */

export interface ApiKeyRoutePolicy {
  method: string;
  /** Matched against the path with the /api or /api/v1 prefix and trailing slash removed. */
  pattern: RegExp;
  scope: string;
}

const ID = '[0-9a-fA-F-]{36}';

export const API_KEY_ROUTE_POLICY: ReadonlyArray<ApiKeyRoutePolicy> = [
  // Klaros workforce contract
  { method: 'GET', pattern: /^\/integrations\/klaros\/workforce$/i, scope: 'workforce.read' },
  { method: 'PUT', pattern: /^\/integrations\/klaros\/workforce$/i, scope: 'workforce.write' },
  { method: 'GET', pattern: /^\/integrations\/klaros\/agents$/i, scope: 'workforce.read' },
  { method: 'GET', pattern: /^\/integrations\/klaros\/health$/i, scope: 'workforce.read' },

  // Leads
  { method: 'POST', pattern: /^\/leads$/i, scope: 'leads.write' },
  { method: 'PUT', pattern: new RegExp(`^/leads/${ID}$`, 'i'), scope: 'leads.write' },
  { method: 'GET', pattern: /^\/leads$/i, scope: 'leads.read' },
  { method: 'GET', pattern: new RegExp(`^/leads/${ID}$`, 'i'), scope: 'leads.read' },

  // Calls
  { method: 'POST', pattern: /^\/calls\/outbound$/i, scope: 'calls.write' },
  { method: 'GET', pattern: /^\/calls$/i, scope: 'calls.read' },
  { method: 'GET', pattern: new RegExp(`^/calls/${ID}$`, 'i'), scope: 'calls.read' },

  // Appointments (read-only)
  { method: 'GET', pattern: /^\/appointments$/i, scope: 'appointments.read' },
  { method: 'GET', pattern: new RegExp(`^/appointments/${ID}$`, 'i'), scope: 'appointments.read' },

  // Webhook registration. Responses include the signing secret, so this is a
  // dedicated scope that no other scope implies.
  { method: 'GET', pattern: /^\/webhooks$/i, scope: 'webhooks.manage' },
  { method: 'POST', pattern: /^\/webhooks$/i, scope: 'webhooks.manage' },
  { method: 'PUT', pattern: new RegExp(`^/webhooks/${ID}$`, 'i'), scope: 'webhooks.manage' },
  { method: 'DELETE', pattern: new RegExp(`^/webhooks/${ID}$`, 'i'), scope: 'webhooks.manage' },
  { method: 'GET', pattern: new RegExp(`^/webhooks/${ID}/deliveries$`, 'i'), scope: 'webhooks.manage' },
];

export interface ApiKeyPolicyDecision {
  allowed: boolean;
  /** The scope the matched route requires (absent for an unclassified route). */
  scope?: string;
  reason?: 'unclassified_route' | 'missing_scope';
}

/** `/api/v1/leads/?x=1` -> `/leads`. Anything that doesn't normalize cleanly simply won't match a policy entry. */
export function normalizeApiPath(originalUrl: string): string {
  const withoutQuery = (originalUrl || '').split('?')[0].split('#')[0];
  const withoutPrefix = withoutQuery.replace(/^\/api(?:\/v1)?(?=\/|$)/i, '');
  const trimmed = withoutPrefix.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function evaluateApiKeyPolicy(
  method: string,
  originalUrl: string,
  grantedScopes: readonly string[] | null | undefined
): ApiKeyPolicyDecision {
  const path = normalizeApiPath(originalUrl);
  const verb = (method || '').toUpperCase();
  const entry = API_KEY_ROUTE_POLICY.find((p) => p.method === verb && p.pattern.test(path));
  if (!entry) return { allowed: false, reason: 'unclassified_route' };
  if (!Array.isArray(grantedScopes) || !grantedScopes.includes(entry.scope)) {
    return { allowed: false, reason: 'missing_scope', scope: entry.scope };
  }
  return { allowed: true, scope: entry.scope };
}
