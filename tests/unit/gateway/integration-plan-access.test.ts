import { describe, it, expect, vi, beforeEach } from 'vitest';

const getFeatureSummary = vi.fn();

vi.mock('../../../apps/gateway/src/services/billing/billing.service.js', () => ({
    billingService: { getFeatureSummary },
}));

describe('integration-plan-access', () => {
    beforeEach(() => {
        getFeatureSummary.mockReset();
    });

    it('allows Zapier on Essential (zapier_basic)', async () => {
        getFeatureSummary.mockResolvedValue({
            plan: 'essential',
            crm: 'zapier_basic',
            calendar: 'basic',
        });
        const { assertIntegrationPlanAccess } = await import(
            '../../../apps/gateway/src/services/integrations/integration-plan-access.js'
        );
        const gate = await assertIntegrationPlanAccess('tenant-1', 'zapier');
        expect(gate.ok).toBe(true);
    });

    it('blocks HubSpot on Essential', async () => {
        getFeatureSummary.mockResolvedValue({
            plan: 'essential',
            crm: 'zapier_basic',
            calendar: 'basic',
        });
        const { assertIntegrationPlanAccess } = await import(
            '../../../apps/gateway/src/services/integrations/integration-plan-access.js'
        );
        const gate = await assertIntegrationPlanAccess('tenant-1', 'hubspot');
        expect(gate.ok).toBe(false);
        if (!gate.ok) {
            expect(gate.error).toMatch(/Professional/i);
        }
    });

    it('allows Pipedrive on Professional', async () => {
        getFeatureSummary.mockResolvedValue({
            plan: 'professional',
            crm: 'zapier_full',
            calendar: 'native',
        });
        const { assertIntegrationPlanAccess } = await import(
            '../../../apps/gateway/src/services/integrations/integration-plan-access.js'
        );
        const gate = await assertIntegrationPlanAccess('tenant-1', 'pipedrive');
        expect(gate.ok).toBe(true);
    });

    it('allows Google Calendar on Essential', async () => {
        getFeatureSummary.mockResolvedValue({
            plan: 'essential',
            crm: 'zapier_basic',
            calendar: 'basic',
        });
        const { assertIntegrationPlanAccess } = await import(
            '../../../apps/gateway/src/services/integrations/integration-plan-access.js'
        );
        const gate = await assertIntegrationPlanAccess('tenant-1', 'google-calendar');
        expect(gate.ok).toBe(true);
    });
});
