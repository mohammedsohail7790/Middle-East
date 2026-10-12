import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '../auth/supabase-admin.js';
import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import { tenantApiKeyService } from '../api-keys/apiKey.service.js';
import { customWebhooksService } from '../webhooks/webhooks.service.js';
import { isValidWordingVersion } from '../consent/consent-evidence.js';
import { WORKFORCE_TEMPLATES, type WorkforceVertical } from '../workforce-templates/index.js';
import { applyTemplateToTenant } from '../workforce-templates/provision.js';

/**
 * Klaros-driven provisioning: Klaros (a separate platform) asks Halla to create the AI receptionist for a business Klaros built, so the business
 * never opens a Halla account. This is the ONLY production path that creates a workforce, and it is deliberately narrow:
 *   - it exists only when KLAROS_PROVISIONING_SECRET is set (unset => the route answers 404), and that secret is compared in constant time;
 *   - every business gets its OWN managed owner account (voice_tenants.owner_user_id is unique, so one login cannot own two businesses). It has a
 *     random password nobody is ever told and a mailbox that does not exist, so nobody can sign in as it; it is removed again if provisioning fails.
 *     The tenant carries a placeholder phone number that no carrier can route to, so it can neither receive nor place a call until a real number
 *     is attached later on purpose;
 *   - consent capture and the live safety supervisor are always on, and it refuses to run without an approved consent wording version;
 *   - only verticals listed in PROVISIONABLE_VERTICALS can be created, and the template is the same tenant-agnostic one the sandbox uses;
 *   - the API key and the webhook signing secret are returned exactly once, to the caller, and are never logged.
 */
export class KlarosProvisioningError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 500 | 503 = 400) {
    super(message);
  }
}

export const PROVISIONABLE_VERTICALS: ReadonlyArray<WorkforceVertical> = ['medical_tourism'];

/** Exactly what Klaros's adapter calls, nothing more (workforce, leads, calls, appointments read). Webhook management is NOT included. */
export const KLAROS_KEY_SCOPES = ['workforce.read', 'workforce.write', 'leads.read', 'leads.write', 'calls.read', 'calls.write', 'appointments.read'];
export const KLAROS_KEY_NAME = 'Klaros';
export const KLAROS_WEBHOOK_NAME = 'Klaros';
export const KLAROS_WEBHOOK_EVENTS = [
  'lead.created', 'lead.updated', 'lead.qualified', 'lead.escalated', 'call.completed',
  'appointment.confirmed', 'appointment.rescheduled', 'appointment.cancelled',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProvisionInput {
  klarosTenantId: string;
  businessName: string;
  vertical: WorkforceVertical;
  webhookUrl: string;
  rotate: boolean;
}

export interface ProvisionOutput {
  status: 'created' | 'rotated' | 'exists';
  tenantId: string;
  /** Present only when new credentials were issued by this call. */
  apiKey?: string;
  signingSecret?: string;
  agents: Array<{ name: string; role: string }>;
  consentWordingVersion: string;
}

export function provisioningEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.KLAROS_PROVISIONING_SECRET || '').trim().length >= 32;
}

/** Constant-time check of the platform secret. Both sides are hashed first so the comparison never depends on the length of what was sent. */
export function secretMatches(sent: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = (env.KLAROS_PROVISIONING_SECRET || '').trim();
  if (expected.length < 32 || !sent) return false;
  const a = createHash('sha256').update(sent).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bearerFrom(header: string | undefined): string | undefined {
  const m = /^Bearer\s+(\S+)$/i.exec(header || '');
  return m?.[1];
}

/** Validates the request body. Pure: throws KlarosProvisioningError(400) on anything unexpected. */
export function validateProvisionInput(body: unknown): ProvisionInput {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const klarosTenantId = typeof b.klarosTenantId === 'string' ? b.klarosTenantId.trim().toLowerCase() : '';
  if (!UUID_RE.test(klarosTenantId)) throw new KlarosProvisioningError('klarosTenantId must be a UUID.');

  const businessName = typeof b.businessName === 'string' ? b.businessName.trim() : '';
  // eslint-disable-next-line no-control-regex
  if (businessName.length < 2 || businessName.length > 120 || /[\u0000-\u001f\u007f]/.test(businessName)) {
    throw new KlarosProvisioningError('businessName must be 2-120 printable characters.');
  }

  const vertical = typeof b.vertical === 'string' ? b.vertical : '';
  if (!(PROVISIONABLE_VERTICALS as ReadonlyArray<string>).includes(vertical) || !(vertical in WORKFORCE_TEMPLATES)) {
    throw new KlarosProvisioningError('That business type cannot be provisioned automatically yet.');
  }

  let url: URL;
  try {
    url = new URL(typeof b.webhookUrl === 'string' ? b.webhookUrl.trim() : '');
  } catch {
    throw new KlarosProvisioningError('webhookUrl must be an absolute URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new KlarosProvisioningError('webhookUrl must be https with no credentials, query or fragment.');
  }
  // The address must name THIS business, so a caller cannot register another business's address or an unrelated endpoint.
  if (url.pathname.toLowerCase() !== `/api/v1/webhooks/halla/${klarosTenantId}`) {
    throw new KlarosProvisioningError('webhookUrl must be the Klaros webhook address of this business.');
  }

  return { klarosTenantId, businessName, vertical: vertical as WorkforceVertical, webhookUrl: url.toString(), rotate: b.rotate === true };
}

function config(env: NodeJS.ProcessEnv = process.env): { wordingVersion: string } {
  const wordingVersion = (env.KLAROS_CONSENT_WORDING_VERSION || '').trim();
  // Fail closed: no approved wording, no receptionist. The wording itself is the business's to supply; Halla only records which version was used.
  if (!isValidWordingVersion(wordingVersion)) throw new KlarosProvisioningError('Provisioning is not configured (consent wording).', 503);
  return { wordingVersion };
}

/** Creates and removes the managed owner login. Injectable so the database check can run without the Supabase service key. */
export interface OwnerAccounts {
  create(klarosTenantId: string): Promise<string>;
  remove(userId: string): Promise<void>;
}

export const supabaseOwnerAccounts: OwnerAccounts = {
  async create(klarosTenantId) {
    const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
      email: `klaros-${klarosTenantId}@managed.invalid`,
      password: randomBytes(48).toString('base64url'), // never stored, never shown: no one can sign in as this account
      email_confirm: true,
      user_metadata: { managed_by: 'klaros', klaros_tenant_id: klarosTenantId },
    });
    if (error || !data?.user?.id) throw new KlarosProvisioningError('The receptionist owner account could not be created.', 500);
    return data.user.id;
  },
  async remove(userId) {
    await getSupabaseAdmin().auth.admin.deleteUser(userId);
  },
};

async function issueCredentials(tenantId: string, input: ProvisionInput): Promise<{ apiKey: string; signingSecret: string }> {
  // Re-issuing replaces what Klaros held: the previous key is revoked and the previous webhook removed, so there is never more than one live pair.
  await pool.query(`UPDATE public.tenant_api_keys SET revoked_at = NOW() WHERE tenant_id = $1 AND name = $2 AND revoked_at IS NULL`, [tenantId, KLAROS_KEY_NAME]);
  for (const hook of await customWebhooksService.list(tenantId)) {
    if (hook.name === KLAROS_WEBHOOK_NAME) await customWebhooksService.delete(tenantId, hook.id);
  }
  const key = await tenantApiKeyService.createKey(tenantId, KLAROS_KEY_NAME, KLAROS_KEY_SCOPES);
  const hook = await customWebhooksService.create(tenantId, { name: KLAROS_WEBHOOK_NAME, url: input.webhookUrl, events: KLAROS_WEBHOOK_EVENTS });
  if (!hook.secret) throw new KlarosProvisioningError('The webhook signing secret was not created.', 500);
  return { apiKey: key.key, signingSecret: hook.secret };
}

export async function provisionKlarosBusiness(
  input: ProvisionInput,
  env: NodeJS.ProcessEnv = process.env,
  owners: OwnerAccounts = supabaseOwnerAccounts
): Promise<ProvisionOutput> {
  const { wordingVersion } = config(env);
  const template = WORKFORCE_TEMPLATES[input.vertical];

  const found = await pool.query(`SELECT id FROM public.voice_tenants WHERE metadata->>'klaros_tenant_id' = $1 LIMIT 2`, [input.klarosTenantId]);
  if (found.rows.length > 1) throw new KlarosProvisioningError('More than one receptionist is linked to this business.', 409);
  const agents = template.agents.map((a) => ({ name: a.name, role: a.role }));

  if (found.rows.length === 1) {
    const tenantId = String(found.rows[0].id);
    if (!input.rotate) return { status: 'exists', tenantId, agents, consentWordingVersion: wordingVersion };
    const creds = await issueCredentials(tenantId, input);
    logger.info('KLAROS_PROVISION_ROTATED', { tenantId });
    return { status: 'rotated', tenantId, ...creds, agents, consentWordingVersion: wordingVersion };
  }

  const metadata = {
    klaros_tenant_id: input.klarosTenantId,
    provisioned_by: 'klaros',
    consent_capture: { wording_version: wordingVersion },
    safety_supervisor: { enabled: true },
  };
  const ownerUserId = await owners.create(input.klarosTenantId);
  let tenantId: string | undefined;
  try {
    // The placeholder is not a phone number: no carrier can route to it, so nothing can call this tenant or be called from it until a real number is attached.
    const inserted = await pool.query(
      `INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number, default_language, region, metadata)
       VALUES ($1, $2, $3, 'en', 'gcc', $4::jsonb) RETURNING id`,
      [ownerUserId, input.businessName, `klaros-pending-${randomUUID()}`, JSON.stringify(metadata)]
    );
    tenantId = String(inserted.rows[0].id);
    await applyTemplateToTenant(tenantId, template, { requireTransferNumber: false, enforcePlanLimit: false });
    const creds = await issueCredentials(tenantId, input);
    logger.info('KLAROS_PROVISION_CREATED', { tenantId, vertical: input.vertical, agents: agents.length });
    return { status: 'created', tenantId, ...creds, agents, consentWordingVersion: wordingVersion };
  } catch (err) {
    // Never leave a half-built tenant or an orphan owner account behind: a retry from Klaros then starts clean.
    if (tenantId) {
      await pool.query(`DELETE FROM public.voice_tenants WHERE id = $1 AND metadata->>'klaros_tenant_id' = $2`, [tenantId, input.klarosTenantId]).catch(() => undefined);
    }
    await owners.remove(ownerUserId).catch(() => undefined);
    logger.warn('KLAROS_PROVISION_FAILED', { tenantId, error: err instanceof Error ? err.name : 'error' });
    if (err instanceof KlarosProvisioningError) throw err;
    throw new KlarosProvisioningError('The receptionist could not be created.', 500);
  }
}
