import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const clientQuery = vi.fn();
const clientRelease = vi.fn();
const connect = vi.fn(async () => ({
    query: clientQuery,
    release: clientRelease,
}));

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
    voiceDb: { query, connect },
}));

vi.mock('../../../apps/gateway/src/services/logger.js', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../apps/gateway/src/services/billing/billing.service.js', () => ({
    billingService: { provisionFreeTrial: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../apps/gateway/src/services/ai-config/ai-config.service.js', () => ({
    aiConfigService: { upsertConfig: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../apps/gateway/src/services/realtime/receptionist-voice.js', () => ({
    formatDefaultGreeting: () => 'Hello',
}));

vi.mock('../../../apps/gateway/src/services/dashboard/dashboard-events.js', () => ({
    publishDashboardPushType: vi.fn(),
}));

const orgRow = {
    id: 'org-1',
    name: 'Acme Corporation',
    slug: 'acme-corporation',
    description: null,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: null,
};

describe('organization.service (ORG-001)', () => {
    beforeEach(() => {
        query.mockReset();
        clientQuery.mockReset();
        clientRelease.mockReset();
        connect.mockClear();
        vi.resetModules();
    });

    it('generates stable slugs from organization names', async () => {
        const { generateOrganizationSlug } = await import(
            '../../../apps/gateway/src/services/organizations/organization.service.js'
        );
        expect(generateOrganizationSlug('Acme Corporation')).toBe('acme-corporation');
        expect(generateOrganizationSlug('Acme HVAC Co.')).toBe('acme-hvac-co');
        expect(generateOrganizationSlug('  Hello   World  ')).toBe('hello-world');
        expect(generateOrganizationSlug('!!!')).toBe('org');
    });

    it('validates name and description', async () => {
        const { validateOrganizationName, validateOrganizationDescription } = await import(
            '../../../apps/gateway/src/services/organizations/organization.service.js'
        );
        expect(validateOrganizationName('  Acme  ')).toBe('Acme');
        expect(() => validateOrganizationName('')).toThrow(/required/i);
        expect(validateOrganizationDescription('')).toBeNull();
        expect(validateOrganizationDescription('  Hello  ')).toBe('Hello');
        expect(() => validateOrganizationDescription('x'.repeat(2001))).toThrow(/2000/);
    });

    it('returns existing membership organization instead of creating a second one', async () => {
        query.mockResolvedValueOnce({ rows: [orgRow] });

        const { createOrganization } = await import(
            '../../../apps/gateway/src/services/organizations/organization.service.js'
        );

        const result = await createOrganization({
            name: 'Acme Corporation',
            createdBy: 'user-1',
        });

        expect(result.existing).toBe(true);
        expect(result.organization.id).toBe('org-1');
        expect(result.organization.slug).toBe('acme-corporation');
        expect(result.organization.createdBy).toBe('user-1');
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('creates organization + owner membership in a transaction, then bridges voice_tenants', async () => {
        const newRow = {
            id: 'org-new',
            name: 'New Co',
            slug: 'new-co',
            description: 'Leadership org',
            created_by: 'user-2',
            created_at: '2026-06-01T00:00:00.000Z',
            updated_at: '2026-06-01T00:00:00.000Z',
        };

        query
            .mockResolvedValueOnce({ rows: [] }) // list memberships
            .mockResolvedValueOnce({ rows: [] }) // slug unique
            .mockResolvedValueOnce({ rows: [] }) // bridge: voice_tenants exists?
            .mockResolvedValueOnce({ rows: [] }); // bridge: insert voice_tenants

        clientQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [newRow] }) // insert org
            .mockResolvedValueOnce({}) // insert member
            .mockResolvedValueOnce({}); // COMMIT

        const { createOrganization } = await import(
            '../../../apps/gateway/src/services/organizations/organization.service.js'
        );

        const result = await createOrganization({
            name: 'New Co',
            description: 'Leadership org',
            createdBy: 'user-2',
        });

        expect(result.existing).toBe(false);
        expect(result.organization.id).toBe('org-new');
        expect(result.organization.description).toBe('Leadership org');
        expect(result.organization.createdBy).toBe('user-2');
        expect(connect).toHaveBeenCalled();
        expect(String(clientQuery.mock.calls[0][0])).toMatch(/^BEGIN$/i);
        expect(String(clientQuery.mock.calls[1][0])).toMatch(/insert into public\.organizations/i);
        expect(String(clientQuery.mock.calls[2][0])).toMatch(/insert into public\.organization_members/i);
        expect(clientQuery.mock.calls[2][1]).toEqual(['org-new', 'user-2']);
        expect(String(clientQuery.mock.calls[3][0])).toMatch(/^COMMIT$/i);
        expect(clientRelease).toHaveBeenCalled();
    });

    it('rolls back when owner membership insert fails', async () => {
        query
            .mockResolvedValueOnce({ rows: [] }) // list
            .mockResolvedValueOnce({ rows: [] }); // slug

        clientQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'org-x',
                        name: 'X',
                        slug: 'x',
                        description: null,
                        created_by: 'user-2',
                        created_at: '2026-06-01T00:00:00.000Z',
                        updated_at: null,
                    },
                ],
            })
            .mockRejectedValueOnce(new Error('member insert failed'))
            .mockResolvedValueOnce({}); // ROLLBACK

        const { createOrganization } = await import(
            '../../../apps/gateway/src/services/organizations/organization.service.js'
        );

        await expect(
            createOrganization({ name: 'X', createdBy: 'user-2' })
        ).rejects.toThrow(/member insert failed/);

        expect(String(clientQuery.mock.calls.at(-1)?.[0])).toMatch(/^ROLLBACK$/i);
        expect(clientRelease).toHaveBeenCalled();
    });

    it('forbids non-members from reading by slug', async () => {
        query
            .mockResolvedValueOnce({ rows: [orgRow] }) // find by slug
            .mockResolvedValueOnce({ rows: [] }); // membership miss

        const { getOrganizationBySlugForUser } = await import(
            '../../../apps/gateway/src/services/organizations/organization.service.js'
        );

        await expect(getOrganizationBySlugForUser('acme-corporation', 'other-user')).rejects.toMatchObject({
            status: 403,
        });
    });

    it('updates name/description without changing slug', async () => {
        const updated = {
            ...orgRow,
            name: 'Acme Renamed',
            description: 'New desc',
            updated_at: '2026-07-01T00:00:00.000Z',
        };

        query
            .mockResolvedValueOnce({ rows: [{ role: 'owner' }] }) // membership
            .mockResolvedValueOnce({ rows: [updated] }) // update org
            .mockResolvedValueOnce({ rows: [] }); // sync voice_tenants

        const { updateOrganization } = await import(
            '../../../apps/gateway/src/services/organizations/organization.service.js'
        );

        const org = await updateOrganization('org-1', 'user-1', {
            name: 'Acme Renamed',
            description: 'New desc',
        });

        expect(org.name).toBe('Acme Renamed');
        expect(org.slug).toBe('acme-corporation');

        const updateSql = String(query.mock.calls[1][0]);
        expect(updateSql).toMatch(/update public\.organizations/i);
        expect(updateSql).not.toMatch(/\bslug\s*=/);
    });

    it('forbids update when membership role is not owner', async () => {
        // Defense for ORG-002+; ORG-001 DB CHECK only allows owner
        query.mockResolvedValueOnce({ rows: [{ role: 'member' }] });

        const { updateOrganization } = await import(
            '../../../apps/gateway/src/services/organizations/organization.service.js'
        );

        await expect(
            updateOrganization('org-1', 'user-1', { name: 'Nope' })
        ).rejects.toMatchObject({ status: 403 });
    });

    describe('acceptance / auth isolation (ORG-001)', () => {
        it('lists only organizations the user belongs to', async () => {
            query.mockResolvedValueOnce({
                rows: [orgRow],
            });

            const { listOrganizationsForUser } = await import(
                '../../../apps/gateway/src/services/organizations/organization.service.js'
            );

            const items = await listOrganizationsForUser('user-1');
            expect(items).toHaveLength(1);
            expect(items[0].id).toBe('org-1');

            const sql = String(query.mock.calls[0][0]);
            expect(sql).toMatch(/organization_members/);
            expect(sql).toMatch(/m\.user_id = \$1/);
        });

        it('allows members to read by slug', async () => {
            query
                .mockResolvedValueOnce({ rows: [orgRow] })
                .mockResolvedValueOnce({ rows: [{ role: 'owner' }] });

            const { getOrganizationBySlugForUser } = await import(
                '../../../apps/gateway/src/services/organizations/organization.service.js'
            );

            const org = await getOrganizationBySlugForUser('acme-corporation', 'user-1');
            expect(org.id).toBe('org-1');
        });

        it('does not authorize from created_by alone (membership required)', async () => {
            query
                .mockResolvedValueOnce({
                    rows: [{ ...orgRow, created_by: 'user-1' }],
                })
                .mockResolvedValueOnce({ rows: [] }); // no membership

            const { getOrganizationByIdForUser } = await import(
                '../../../apps/gateway/src/services/organizations/organization.service.js'
            );

            await expect(getOrganizationByIdForUser('org-1', 'user-1')).rejects.toMatchObject({
                status: 403,
            });
        });

        it('assertOrganizationMembership returns role for members', async () => {
            query.mockResolvedValueOnce({ rows: [{ role: 'owner' }] });

            const { assertOrganizationMembership } = await import(
                '../../../apps/gateway/src/services/organizations/organization.service.js'
            );

            await expect(assertOrganizationMembership('org-1', 'user-1')).resolves.toEqual({
                role: 'owner',
            });
        });
    });
});
