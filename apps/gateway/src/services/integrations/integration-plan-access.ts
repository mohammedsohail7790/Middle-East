/**
 * Subscription plan gates for integration connect + dispatch.
 * Mirrors apps/dashboard/src/lib/integration-hub-catalog.ts planRequired flags.
 */

import { billingService } from '../billing/billing.service.js';
import { getIntegrationCatalogEntry } from './integration-catalog.js';

const PLAN_RANK: Record<string, number> = { essential: 1, professional: 2 };

/** Available on Essential — Zapier + Google Calendar + Slack only. */
const ESSENTIAL_INTEGRATIONS = new Set(['zapier', 'google-calendar', 'google', 'slack']);

const INTEGRATION_LABELS: Record<string, string> = {
    zapier: 'Zapier',
    'google-calendar': 'Google Calendar',
    slack: 'Slack',
};

function labelFor(id: string): string {
    return INTEGRATION_LABELS[id] || getIntegrationCatalogEntry(id)?.id || id;
}

export type IntegrationPlanGate =
    | { ok: true }
    | { ok: false; status: number; error: string; currentPlan?: string };

function denied(
    status: number,
    error: string,
    currentPlan?: string
): Extract<IntegrationPlanGate, { ok: false }> {
    return { ok: false, status, error, currentPlan };
}

export async function assertIntegrationPlanAccess(
    tenantId: string,
    integrationId: string
): Promise<IntegrationPlanGate> {
    const summary = await billingService.getFeatureSummary(tenantId);
    const id = integrationId === 'google' ? 'google-calendar' : integrationId;

    if (summary.plan === 'none') {
        return denied(
            403,
            'An active subscription is required to connect integrations.',
            'none'
        );
    }

    if (id === 'zapier') {
        if (summary.crm === 'none') {
            return denied(403, 'Zapier is not available on your current plan.', summary.plan);
        }
        return { ok: true as const };
    }

    if (ESSENTIAL_INTEGRATIONS.has(id)) {
        return { ok: true as const };
    }

    const entry = getIntegrationCatalogEntry(id);
    const planRank = PLAN_RANK[summary.plan] ?? 0;

    if (summary.crm === 'zapier_basic') {
        return denied(
            403,
            `${labelFor(id)} requires a Professional plan or higher. On Essential, connect your CRM through Zapier.`,
            summary.plan
        );
    }

    if (entry?.category === 'calendar' && id !== 'google-calendar' && summary.calendar === 'basic') {
        return denied(
            403,
            'Native calendar integrations require a Professional plan or higher.',
            summary.plan
        );
    }

    if (planRank < 2) {
        return denied(403, `${labelFor(id)} requires a Professional plan or higher.`, summary.plan);
    }

    return { ok: true as const };
}

export async function canDispatchIntegration(tenantId: string, integrationId: string): Promise<boolean> {
    const gate = await assertIntegrationPlanAccess(tenantId, integrationId);
    return gate.ok;
}
