/**
 * ORG-001 — Organizations as tenancy boundary (ADR-001).
 * Persistence: public.organizations + organization_members.
 * Call IQ bridge: voice_tenants.id = organizations.id (1:1).
 */

import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';

export type OrganizationRecord = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string | null;
};

export type CreateOrganizationInput = {
    name: string;
    description?: string | null;
    createdBy: string;
};

const ORG_SELECT = `id, name, slug, description, created_by, created_at, updated_at`;

export function generateOrganizationSlug(name: string): string {
    const base = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return base || 'org';
}

export function validateOrganizationName(name: unknown): string {
    if (typeof name !== 'string') {
        throw Object.assign(new Error('name is required'), { status: 400 });
    }
    const trimmed = name.trim();
    if (!trimmed) {
        throw Object.assign(new Error('name is required'), { status: 400 });
    }
    if (trimmed.length > 120) {
        throw Object.assign(new Error('name must be 120 characters or fewer'), { status: 400 });
    }
    return trimmed;
}

export function validateOrganizationDescription(description: unknown): string | null {
    if (description == null || description === '') return null;
    if (typeof description !== 'string') {
        throw Object.assign(new Error('description must be a string'), { status: 400 });
    }
    const trimmed = description.trim();
    if (trimmed.length > 2000) {
        throw Object.assign(new Error('description must be 2000 characters or fewer'), { status: 400 });
    }
    return trimmed || null;
}

function mapRow(row: Record<string, unknown>): OrganizationRecord {
    return {
        id: String(row.id),
        name: String(row.name || ''),
        slug: String(row.slug || ''),
        description: row.description != null ? String(row.description) : null,
        createdBy: row.created_by != null ? String(row.created_by) : null,
        createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : '',
        updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
    };
}

async function allocateUniqueSlug(base: string): Promise<string> {
    let candidate = base;
    for (let i = 0; i < 20; i++) {
        const check = await voiceDb.query(
            `select 1 from public.organizations where slug = $1 limit 1`,
            [candidate]
        );
        if (!check.rows.length) return candidate;
        candidate = `${base}-${i + 2}`.slice(0, 64);
    }
    return `${base}-${Date.now().toString(36)}`.slice(0, 64);
}

export async function assertOrganizationMembership(
    organizationId: string,
    userId: string
): Promise<{ role: string }> {
    const result = await voiceDb.query(
        `select role from public.organization_members
         where organization_id = $1 and user_id = $2
         limit 1`,
        [organizationId, userId]
    );
    if (!result.rows.length) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    return { role: String(result.rows[0].role) };
}

export async function listOrganizationsForUser(userId: string): Promise<OrganizationRecord[]> {
    const result = await voiceDb.query(
        `select o.id, o.name, o.slug, o.description, o.created_by, o.created_at, o.updated_at
         from public.organizations o
         inner join public.organization_members m on m.organization_id = o.id
         where m.user_id = $1
         order by o.created_at desc`,
        [userId]
    );
    return (result.rows as Record<string, unknown>[]).map(mapRow);
}

export async function findOrganizationBySlug(slug: string): Promise<OrganizationRecord | null> {
    const result = await voiceDb.query(
        `select ${ORG_SELECT} from public.organizations where slug = $1 limit 1`,
        [slug]
    );
    if (!result.rows.length) return null;
    return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function findOrganizationById(id: string): Promise<OrganizationRecord | null> {
    const result = await voiceDb.query(
        `select ${ORG_SELECT} from public.organizations where id = $1 limit 1`,
        [id]
    );
    if (!result.rows.length) return null;
    return mapRow(result.rows[0] as Record<string, unknown>);
}

/** Membership-gated read by slug. */
export async function getOrganizationBySlugForUser(
    slug: string,
    userId: string
): Promise<OrganizationRecord> {
    const org = await findOrganizationBySlug(slug);
    if (!org) {
        throw Object.assign(new Error('Organization not found'), { status: 404 });
    }
    await assertOrganizationMembership(org.id, userId);
    return org;
}

/** Membership-gated read by id. */
export async function getOrganizationByIdForUser(
    id: string,
    userId: string
): Promise<OrganizationRecord> {
    const org = await findOrganizationById(id);
    if (!org) {
        throw Object.assign(new Error('Organization not found'), { status: 404 });
    }
    await assertOrganizationMembership(org.id, userId);
    return org;
}

async function provisionVoiceTenantBridge(org: OrganizationRecord): Promise<void> {
    const existing = await voiceDb.query(
        `select id from public.voice_tenants where id = $1 limit 1`,
        [org.id]
    );
    if (existing.rows.length) {
        await voiceDb.query(
            `update public.voice_tenants
             set company_name = $2, org_slug = $3, org_description = $4
             where id = $1`,
            [org.id, org.name, org.slug, org.description]
        );
        return;
    }

    const placeholderPhone = `+1000${Date.now().toString().slice(-7)}`;
    const agentName = 'Sarah';
    const metadata = {
        services_offered: [],
        tone: 'professional',
        question_flow: [],
        integrations: { zapier: { enabled: false } },
        industries: [],
        industry: null,
        language_mode: 'en',
        agent_name: agentName,
        agent_display_name: agentName,
        capabilities: {
            bookAppointments: true,
            transferCalls: true,
            collectPayments: false,
            sendSMS: true,
            accessKnowledge: true,
        },
    };
    const prompt = `You are ${agentName}, the AI receptionist for ${org.name}. Be professional, helpful, and concise.`;

    await voiceDb.query(
        `insert into public.voice_tenants (
           id, owner_user_id, company_name, phone_number, voice_tone, timezone,
           metadata, system_prompt, voice_id, default_language,
           org_slug, org_description
         )
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)`,
        [
            org.id,
            org.createdBy,
            org.name,
            placeholderPhone,
            'professional',
            'America/New_York',
            JSON.stringify(metadata),
            prompt,
            'marin',
            'en',
            org.slug,
            org.description,
        ]
    );

    try {
        const { billingService } = await import('../billing/billing.service.js');
        await billingService.provisionFreeTrial(org.id);
    } catch (trialErr) {
        logger.error('Failed to provision free trial for organization tenant bridge', {
            organizationId: org.id,
            error: String(trialErr),
        });
    }

    try {
        const { aiConfigService } = await import('../ai-config/ai-config.service.js');
        const { formatDefaultGreeting } = await import('../realtime/receptionist-voice.js');
        await aiConfigService.upsertConfig(
            org.id,
            {
                agentName,
                greetingMessage: formatDefaultGreeting(org.name, agentName),
                voiceId: 'marin',
                tone: 'professional',
                language: 'en',
                systemInstructions: prompt,
                speechRate: 0.97,
                personality: `Warm, direct receptionist for ${org.name}`,
            },
            metadata.capabilities
        );
    } catch (configErr) {
        logger.error('Failed to seed AI config for organization tenant bridge', {
            organizationId: org.id,
            error: String(configErr),
        });
    }
}

export type CreateOrganizationResult =
    | { organization: OrganizationRecord; existing: true }
    | { organization: OrganizationRecord; existing: false };

export async function createOrganization(input: CreateOrganizationInput): Promise<CreateOrganizationResult> {
    const name = validateOrganizationName(input.name);
    const description = validateOrganizationDescription(input.description);

    const existingList = await listOrganizationsForUser(input.createdBy);
    if (existingList.length > 0) {
        return { organization: existingList[0], existing: true };
    }

    const slug = await allocateUniqueSlug(generateOrganizationSlug(name));

    // Atomic: organization + owner membership (no orphan orgs without owners)
    const client = await voiceDb.connect();
    let organization: OrganizationRecord;
    try {
        await client.query('BEGIN');

        const inserted = await client.query(
            `insert into public.organizations (id, name, slug, description, created_by, created_at, updated_at)
             values (gen_random_uuid(), $1, $2, $3, $4, now(), now())
             returning ${ORG_SELECT}`,
            [name, slug, description, input.createdBy]
        );

        organization = mapRow(inserted.rows[0] as Record<string, unknown>);

        await client.query(
            `insert into public.organization_members (organization_id, user_id, role, joined_at)
             values ($1, $2, 'owner', now())`,
            [organization.id, input.createdBy]
        );

        await client.query('COMMIT');
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore rollback errors */
        }
        throw err;
    } finally {
        client.release();
    }

    // Call IQ bridge is best-effort after tenancy rows are durable
    try {
        await provisionVoiceTenantBridge(organization);
    } catch (bridgeErr) {
        logger.error('Organization created but voice tenant bridge failed', {
            organizationId: organization.id,
            error: String(bridgeErr),
        });
    }

    try {
        const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
        publishDashboardPushType(organization.id, 'billing.updated', [], { created: true });
        publishDashboardPushType(organization.id, 'config.updated');
    } catch {
        /* non-fatal */
    }

    return { organization, existing: false };
}

/** PATCH — name/description only. Slug is immutable. */
export async function updateOrganization(
    id: string,
    userId: string,
    patch: { name?: string; description?: string | null }
): Promise<OrganizationRecord> {
    // ORG-001: only owner may update; admin/member roles arrive with ORG-002
    const membership = await assertOrganizationMembership(id, userId);
    if (membership.role !== 'owner') {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    const name = patch.name !== undefined ? validateOrganizationName(patch.name) : undefined;
    const description =
        patch.description !== undefined
            ? validateOrganizationDescription(patch.description)
            : undefined;

    if (name === undefined && description === undefined) {
        return getOrganizationByIdForUser(id, userId);
    }

    const result = await voiceDb.query(
        `update public.organizations
         set name = coalesce($2, name),
             description = case when $3::boolean then $4 else description end,
             updated_at = now()
         where id = $1
         returning ${ORG_SELECT}`,
        [
            id,
            name ?? null,
            description !== undefined,
            description ?? null,
        ]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error('Organization not found'), { status: 404 });
    }

    const organization = mapRow(result.rows[0] as Record<string, unknown>);

    try {
        await voiceDb.query(
            `update public.voice_tenants
             set company_name = $2, org_description = $3
             where id = $1`,
            [organization.id, organization.name, organization.description]
        );
    } catch {
        /* bridge optional if tenant missing */
    }

    return organization;
}
