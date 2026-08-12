/**
 * Billing service — skeleton stub.
 * Real billing (Stripe, metered usage, plan tiers) was removed for the Halla AI skeleton.
 * Every tenant is treated as having an active, unrestricted subscription so the
 * core voice pipeline is never gated. Reintroduce a real billing provider here later.
 */

export interface Subscription {
  tenantId: string;
  status: 'active' | 'trialing' | 'paused' | 'canceled';
  plan: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageAllowance {
  allowed: boolean;
  usedMinutes?: number;
  limitMinutes?: number;
  reason?: string;
}

export interface FeatureSummary {
  plan: string;
  status: Subscription['status'];
}

function buildUnrestrictedSubscription(tenantId: string): Subscription {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return {
    tenantId,
    status: 'active',
    plan: 'unlimited',
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    createdAt: now,
    updatedAt: now,
  };
}

export const billingService = {
  async getActiveSubscription(tenantId: string): Promise<Subscription | null> {
    return buildUnrestrictedSubscription(tenantId);
  },

  async getSubscription(tenantId: string): Promise<Subscription | null> {
    return buildUnrestrictedSubscription(tenantId);
  },

  async canUseFeature(_tenantId: string, _feature: string): Promise<boolean> {
    return true;
  },

  async checkUsageAllowance(_tenantId: string, _sub: Subscription): Promise<UsageAllowance> {
    return { allowed: true };
  },

  async getFeatureSummary(_tenantId: string): Promise<FeatureSummary> {
    return { plan: 'unlimited', status: 'active' };
  },

  async provisionFreeTrial(_orgOrTenantId: string): Promise<void> {
    // No-op — skeleton has no billing provider to provision against.
  },

  async trackCallMinutes(_tenantId: string, _callSid: string, _durationMs: number): Promise<void> {
    // No-op — reintroduce usage metering with a real billing provider.
  },
};
