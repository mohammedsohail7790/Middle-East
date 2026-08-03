import { billingService } from './billing.service.js';
import { trialManager } from './trial.service.js';

export type AccountMode = 'trialing' | 'active' | 'locked' | 'none';

export interface AccountAccess {
  mode: AccountMode;
  canCall: boolean;
  canEdit: boolean;
  canUseIntegrations: boolean;
  canRunAutomations: boolean;
  dashboardReadOnly: boolean;
  blockReason: string | null;
}

const cache: Map<string, { at: number; access: AccountAccess }> = new Map();
const TTL_MS = 15_000;

export async function getAccountAccess(tenantId: string): Promise<AccountAccess> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.access;

  const trial = await trialManager.getTrialStatus(tenantId);
  const sub = await billingService.getSubscription(tenantId);
  const activeSub = await billingService.getActiveSubscription(tenantId);
  const trialBlock = await trialManager.isTrialBlocked(tenantId);

  let mode: AccountMode = 'none';
  if (trial.isLocked || sub?.status === 'paused') mode = 'locked';
  else if (trial.isTrialing) mode = 'trialing';
  else if (sub && ['active', 'past_due'].includes(sub.status)) mode = 'active';
  else if (!sub) mode = 'none';

  const access: AccountAccess = {
    mode,
    canCall: !trialBlock.blocked && !!activeSub,
    canEdit: mode !== 'locked',
    canUseIntegrations: mode !== 'locked',
    canRunAutomations: mode !== 'locked',
    dashboardReadOnly: mode === 'locked',
    blockReason: trial.blockReason || (mode === 'locked' ? 'Account restricted — upgrade required' : null),
  };

  cache.set(tenantId, { at: Date.now(), access });
  return access;
}

export function invalidateAccountAccessCache(tenantId: string): void {
  cache.delete(tenantId);
}

export async function assertOperationalAccess(
  tenantId: string,
  feature: 'integrations' | 'automations' | 'edit'
): Promise<{ allowed: boolean; reason?: string }> {
  const access = await getAccountAccess(tenantId);
  if (feature === 'integrations' && !access.canUseIntegrations) {
    return { allowed: false, reason: access.blockReason || 'Integrations paused' };
  }
  if (feature === 'automations' && !access.canRunAutomations) {
    return { allowed: false, reason: access.blockReason || 'Automations paused' };
  }
  if (feature === 'edit' && !access.canEdit) {
    return { allowed: false, reason: access.blockReason || 'Account is read-only' };
  }
  return { allowed: true };
}
