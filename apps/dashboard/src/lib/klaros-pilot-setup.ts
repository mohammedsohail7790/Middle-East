/**
 * Klaros pilot connection: logic behind the owner-only "Klaros pilot" dashboard page.
 *
 * It is written against an injected API client so it can be tested without a browser, and so that in the app it runs on the
 * dashboard's own client (`api` in ./api), which already attaches the signed-in session, the tenant header and the CSRF token.
 * Nothing here reads a cookie or a token.
 *
 * Safeguards (each is covered by tests/unit/gateway/klaros-pilot-dashboard-setup.test.ts):
 *   - refuses the existing Call IQ and Halla AI tenants;
 *   - nothing is created unless the caller types back the exact tenant id and exact tenant name that the plan shows;
 *   - idempotent (an existing active key / an existing webhook for the URL is never duplicated);
 *   - one-time values (API key, signing secret) are only RETURNED to the caller, never logged; if the create result is unusable or
 *     the connection drops after the server processed it, the object is located by its unique name/URL and removed, and the result
 *     of that removal is verified, so a valid credential nobody saw cannot be left behind;
 *   - the webhook is only registered once the owner-gated runtime key exists (the gateway does not role-check webhook creation).
 */

export type PilotKey = 'medical_tourism' | 'dropshipping';

/** The dashboard client's surface that this module needs. Each call resolves to the response `data` and throws on a non-2xx. */
export interface ApiLike {
  get<T>(path: string, options?: { fresh?: boolean }): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

export const NEVER_TOUCH_TENANTS: readonly string[] = [
  'ad9c3394-f7ab-42af-aa74-43f2b0d8b52c', // Call IQ
  'f90e10ca-e975-4bf6-bc8d-97d7318cd9da', // Halla AI
];
export const KLAROS_PILOT_BASE_URL = 'https://klaros-halla-pilot.onrender.com';
export const RUNTIME_SCOPES: readonly string[] = ['workforce.read', 'workforce.write', 'leads.read', 'leads.write'];
/** Only events the production gateway actually emits. `appointment.requested` is deliberately absent. */
export const PILOT_EVENTS: readonly string[] = [
  'lead.created', 'lead.updated', 'lead.qualified', 'lead.escalated',
  'call.completed', 'appointment.confirmed', 'appointment.rescheduled', 'appointment.cancelled',
];
export const KEY_LIFETIME_DAYS = 90;
export const ACKNOWLEDGEMENT = 'I reviewed the plan';

export interface PilotDefinition {
  label: string;
  klarosTenantId: string;
  keyName: string;
  webhookName: string;
  keyEnv: string;
  secretEnv: string;
}
export const PILOTS: Readonly<Record<PilotKey, PilotDefinition>> = {
  medical_tourism: {
    label: 'Medical Tourism',
    klarosTenantId: 'c14d42d1-4c63-46c1-bdc3-89d4dc2b7b7b',
    keyName: 'klaros-pilot-runtime (medical tourism)',
    webhookName: 'Klaros pilot (medical tourism)',
    keyEnv: 'HALLA_API_KEY_MT',
    secretEnv: 'HALLA_WEBHOOK_SECRET_MT',
  },
  dropshipping: {
    label: 'Dropshipping',
    klarosTenantId: '8f3a3df4-b999-4d72-8d17-667c91edf494',
    keyName: 'klaros-pilot-runtime (dropshipping)',
    webhookName: 'Klaros pilot (dropshipping)',
    keyEnv: 'HALLA_API_KEY_DS',
    secretEnv: 'HALLA_WEBHOOK_SECRET_DS',
  },
};

export class PilotSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PilotSetupError';
  }
}

export interface TenantIdentity { id: string; name: string; escalationNumberSet: boolean }
interface KeyRow { id: string; name: string; keyPrefix?: string; revokedAt?: string | null; expiresAt?: string | null }
interface HookRow { id: string; url: string }
export interface Confirmation { tenantId: string; tenantName: string; acknowledge: string }

export interface PilotPlan {
  pilot: PilotKey;
  tenant: TenantIdentity;
  scopes: readonly string[];
  keyName: string;
  keyExpiresInDays: number;
  keyExists: { id: string; prefix: string } | null;
  webhookName: string;
  webhookUrl: string;
  events: readonly string[];
  webhookExists: { id: string } | null;
  keyEnv: string;
  secretEnv: string;
}

const asRows = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v && typeof v === 'object' && Array.isArray((v as { data?: unknown }).data) ? ((v as { data: T[] }).data) : []);
const isActiveKey = (k: KeyRow, name: string) => k.name === name && !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > new Date());
export const webhookUrlFor = (pilot: PilotKey) => `${KLAROS_PILOT_BASE_URL}/api/v1/webhooks/halla/${PILOTS[pilot].klarosTenantId}`;

function pilotDef(pilot: string): PilotDefinition {
  if (!Object.prototype.hasOwnProperty.call(PILOTS, pilot)) throw new PilotSetupError('Unknown pilot.');
  return PILOTS[pilot as PilotKey];
}

export async function loadTenant(api: ApiLike): Promise<TenantIdentity> {
  const t = await api.get<{ id?: string; companyName?: string; company_name?: string; transferNumber?: string | null; transfer_phone_number?: string | null }>('/tenants/me', { fresh: true });
  if (!t || !t.id) throw new PilotSetupError('Could not read your tenant. Finish onboarding first.');
  const id = String(t.id).toLowerCase();
  if (NEVER_TOUCH_TENANTS.includes(id)) throw new PilotSetupError('REFUSING: this is an existing company tenant (Call IQ or Halla AI). Use the new business owner account.');
  return {
    id,
    name: String(t.companyName || t.company_name || ''),
    escalationNumberSet: /^\+[1-9]\d{6,14}$/.test(String(t.transferNumber || t.transfer_phone_number || '')), // yes/no only; the number is never returned
  };
}

export async function buildPlan(api: ApiLike, pilot: PilotKey): Promise<PilotPlan> {
  const p = pilotDef(pilot);
  const tenant = await loadTenant(api);
  const keys = asRows<KeyRow>(await api.get('/api-keys', { fresh: true }));
  const hooks = asRows<HookRow>(await api.get('/webhooks', { fresh: true }));
  const k = keys.find((x) => isActiveKey(x, p.keyName));
  const h = hooks.find((x) => x.url === webhookUrlFor(pilot));
  return {
    pilot, tenant, scopes: RUNTIME_SCOPES, keyName: p.keyName, keyExpiresInDays: KEY_LIFETIME_DAYS,
    keyExists: k ? { id: k.id, prefix: String(k.keyPrefix ?? '') } : null,
    webhookName: p.webhookName, webhookUrl: webhookUrlFor(pilot), events: PILOT_EVENTS,
    webhookExists: h ? { id: h.id } : null, keyEnv: p.keyEnv, secretEnv: p.secretEnv,
  };
}

function assertConfirmed(tenant: TenantIdentity, c: Confirmation | undefined): void {
  if (!c || c.tenantId.trim().toLowerCase() !== tenant.id || c.tenantName !== tenant.name || c.acknowledge !== ACKNOWLEDGEMENT) {
    throw new PilotSetupError('Not confirmed: type the exact tenant id and the exact tenant name shown in the plan, and tick the acknowledgement.');
  }
}

async function undoKey(api: ApiLike, id: string, prefix: string, why: string): Promise<never> {
  let ok = true;
  try { await api.post(`/api-keys/${encodeURIComponent(id)}/revoke`, {}); } catch { ok = false; }
  throw new PilotSetupError(ok
    ? `${why} The key was revoked, so nothing valid is left behind.`
    : `${why} AND THE REVOKE FAILED: key id ${id} (prefix ${prefix || 'unknown'}) may still be valid. Revoke it now.`);
}
async function undoWebhook(api: ApiLike, id: string, why: string): Promise<never> {
  let ok = true;
  try { await api.del(`/webhooks/${encodeURIComponent(id)}`); } catch { ok = false; }
  throw new PilotSetupError(ok
    ? `${why} The webhook was deleted, so nothing is left behind.`
    : `${why} AND THE DELETE FAILED: webhook id ${id} may still exist. Delete it now.`);
}

export type KeyResult = { status: 'created'; id: string; prefix: string; value: string } | { status: 'exists'; id: string; prefix: string };

/** Creates the tenant's runtime key. The returned `value` exists only here: the caller shows it once and must not log or persist it. */
export async function createRuntimeKey(api: ApiLike, pilot: PilotKey, c: Confirmation | undefined): Promise<KeyResult> {
  const p = pilotDef(pilot);
  const tenant = await loadTenant(api);
  assertConfirmed(tenant, c);
  const existing = asRows<KeyRow>(await api.get('/api-keys', { fresh: true })).find((k) => isActiveKey(k, p.keyName));
  if (existing) return { status: 'exists', id: existing.id, prefix: String(existing.keyPrefix ?? '') };
  const expiresAt = new Date(Date.now() + KEY_LIFETIME_DAYS * 86400000).toISOString();

  const recover = async (why: string): Promise<never> => {
    let found: KeyRow | undefined;
    try { found = asRows<KeyRow>(await api.get('/api-keys', { fresh: true })).find((k) => isActiveKey(k, p.keyName)); } catch { found = undefined; }
    if (!found) throw new PilotSetupError(`${why} No key named "${p.keyName}" could be found afterwards; reload the plan to confirm nothing was created.`);
    return undoKey(api, found.id, String(found.keyPrefix ?? ''), why);
  };

  let created: { id?: string; key?: string; keyPrefix?: string } | undefined;
  try {
    created = await api.post('/api-keys', { name: p.keyName, scopes: [...RUNTIME_SCOPES], expiresAt });
  } catch {
    return recover('The create request did not complete cleanly (it may still have been processed).');
  }
  if (!created || typeof created.id !== 'string') return recover('The server created a key but its response was unusable.');
  if (typeof created.key !== 'string' || !created.key.startsWith('sk_calliq_')) return undoKey(api, created.id, String(created.keyPrefix ?? ''), 'Unexpected key format.');
  return { status: 'created', id: created.id, prefix: String(created.keyPrefix ?? ''), value: created.key };
}

export type WebhookResult = { status: 'registered'; id: string; secret: string } | { status: 'exists'; id: string };

/** Registers the webhook to the Klaros pilot. The returned `secret` exists only here: show it once, never log or persist it. */
export async function registerPilotWebhook(api: ApiLike, pilot: PilotKey, c: Confirmation | undefined): Promise<WebhookResult> {
  const p = pilotDef(pilot);
  const tenant = await loadTenant(api);
  assertConfirmed(tenant, c);
  const keys = asRows<KeyRow>(await api.get('/api-keys', { fresh: true }));
  if (!keys.some((k) => isActiveKey(k, p.keyName))) throw new PilotSetupError('Create the runtime key first: the webhook is only registered after the tenant\'s runtime key exists.');
  const url = webhookUrlFor(pilot);
  const existing = asRows<HookRow>(await api.get('/webhooks', { fresh: true })).find((h) => h.url === url);
  if (existing) return { status: 'exists', id: existing.id };

  const recover = async (why: string): Promise<never> => {
    let found: HookRow | undefined;
    try { found = asRows<HookRow>(await api.get('/webhooks', { fresh: true })).find((h) => h.url === url); } catch { found = undefined; }
    if (!found) throw new PilotSetupError(`${why} No webhook for ${url} could be found afterwards; reload the plan to confirm nothing was created.`);
    return undoWebhook(api, found.id, why);
  };

  let created: { id?: string; secret?: string } | undefined;
  try {
    created = await api.post('/webhooks', { name: p.webhookName, url, events: [...PILOT_EVENTS] });
  } catch {
    return recover('The register request did not complete cleanly (it may still have been processed).');
  }
  if (!created || typeof created.id !== 'string') return recover('The server created a webhook but its response was unusable.');
  if (typeof created.secret !== 'string' || created.secret.length < 16) return undoWebhook(api, created.id, 'Unexpected response.');
  return { status: 'registered', id: created.id, secret: created.secret };
}

/** Used when the owner could not store a one-time value: remove it so a value nobody kept cannot stay valid. */
export async function discardKey(api: ApiLike, id: string, c: Confirmation | undefined): Promise<void> {
  assertConfirmed(await loadTenant(api), c);
  await api.post(`/api-keys/${encodeURIComponent(id)}/revoke`, {});
}
export async function discardWebhook(api: ApiLike, id: string, c: Confirmation | undefined): Promise<void> {
  assertConfirmed(await loadTenant(api), c);
  await api.del(`/webhooks/${encodeURIComponent(id)}`);
}
