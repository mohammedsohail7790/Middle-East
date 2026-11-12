/**
 * What the pricing table promises, as the gateway enforces it: an Enterprise plan with its own limits, a choice of voices only from Professional,
 * advanced analytics only on Enterprise (and in the trial), and the $39 WhatsApp add-on. Stripe and the database are stubs, so this proves the gateway's
 * decisions, not what Stripe or a real tenant would do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
  return {
    query: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    itemCreate: vi.fn(),
    itemDel: vi.fn(),
  };
});

vi.mock('stripe', () => ({
  default: class {
    subscriptions = { retrieve: h.retrieve, update: h.update, cancel: vi.fn() };
    subscriptionItems = { create: h.itemCreate, del: h.itemDel };
    prices = { list: vi.fn(async () => ({ data: [] })) };
  },
}));
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: h.query } }));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/redis-connection.js', () => ({
  createRedisClient: () => ({ get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn(), on: vi.fn() }),
}));

import { billingService, PLANS } from '../../../apps/gateway/src/services/billing/billing.service.js';
import { PLAN_FEATURES, validateVoiceConfig, VOICE_RULES, ESSENTIAL_STANDARD_VOICE } from '../../../apps/gateway/src/config/plan-config.js';
import { getMaxAiAgents, getMaxPhoneNumbers } from '../../../apps/gateway/src/config/plan-limits.js';
import { BillingNotConfiguredError } from '../../../apps/gateway/src/services/billing/billing-errors.js';
import { isPlanPurchasable, parsePlanKey, resolveSubscriptionPriceId } from '../../../apps/gateway/src/services/billing/stripe-catalog.js';

const T = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  h.query.mockReset();
  h.retrieve.mockReset();
  h.update.mockReset();
  h.itemCreate.mockReset();
  h.itemDel.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ['WHATSAPP_ADDON_ENFORCED', 'STRIPE_WHATSAPP_ADDON_PRICE_ID', 'STRIPE_ENTERPRISE_PRICE_ID', 'STRIPE_ENTERPRISE_PRODUCT_ID_MONTHLY', 'STRIPE_ENTERPRISE_PRODUCT_ID_ANNUAL', 'STRIPE_ENTERPRISE_ANNUAL_PRICE_ID']) delete process.env[k];
});

describe('the Enterprise plan', () => {
  it('matches the pricing table: $499, 4,000 minutes, $0.10 extra, 20 numbers, an SLA', () => {
    expect(PLANS.enterprise).toMatchObject({ key: 'enterprise', price: 499, includedMinutes: 4000, overageRate: 0.1 });
    expect(PLANS.enterprise.features.sla).toBe(true);
    expect(PLAN_FEATURES.enterprise).toMatchObject({ includedMinutes: 4000, maxPhoneNumbers: 20, sla: true, apiAccess: true });
    expect(getMaxPhoneNumbers('enterprise')).toBe(20);
    expect(getMaxAiAgents('enterprise')).toBeGreaterThan(getMaxAiAgents('professional'));
  });

  it('keeps the other plans where they were', () => {
    expect(getMaxPhoneNumbers('essential')).toBe(1);
    expect(getMaxPhoneNumbers('professional')).toBe(3);
    expect(getMaxPhoneNumbers('professional', 'trialing')).toBe(3);
    expect(PLANS.professional.price).toBe(149);
    expect(PLANS.essential.price).toBe(39);
  });

  it('ranks above Professional', async () => {
    expect(await billingService.getPlanRank('enterprise')).toBeGreaterThan(await billingService.getPlanRank('professional'));
  });

  it('is on sale only once its Stripe price or product is set, and says so instead of failing oddly', async () => {
    expect(parsePlanKey('enterprise')).toBe('enterprise');
    expect(isPlanPurchasable('enterprise')).toBe(false);
    expect(isPlanPurchasable('essential')).toBe(true);
    await expect(resolveSubscriptionPriceId('enterprise', 'monthly')).rejects.toBeInstanceOf(BillingNotConfiguredError);
    await expect(resolveSubscriptionPriceId('enterprise', 'monthly')).rejects.toThrow(/not on sale yet/);
    process.env.STRIPE_ENTERPRISE_PRICE_ID = 'price_real_enterprise_monthly';
    expect(isPlanPurchasable('enterprise')).toBe(true);
    await expect(resolveSubscriptionPriceId('enterprise', 'monthly')).resolves.toMatchObject({ priceId: 'price_real_enterprise_monthly' });
  });
});

describe('a choice of voices starts at Professional', () => {
  it('gives Essential the standard voice only', () => {
    expect(VOICE_RULES.essential.allowedVoices).toEqual([ESSENTIAL_STANDARD_VOICE]);
    expect(validateVoiceConfig('essential', { voiceProvider: 'openai', voiceId: 'coral' }).valid).toBe(false);
    expect(validateVoiceConfig('essential', { voiceProvider: 'openai', voiceId: ESSENTIAL_STANDARD_VOICE }).valid).toBe(true);
  });

  it('never breaks a saved setup: keeping the voice already in use is allowed', () => {
    expect(validateVoiceConfig('essential', { voiceProvider: 'openai', voiceId: 'coral' }, 'coral').valid).toBe(true);
  });

  it('lets Professional, Enterprise and the trial pick any voice', () => {
    for (const plan of ['professional', 'enterprise', 'trial', 'trialing']) {
      expect(validateVoiceConfig(plan, { voiceProvider: 'openai', voiceId: 'cedar' }).valid).toBe(true);
    }
  });

  it('does not touch saves that leave the voice out', () => {
    expect(validateVoiceConfig('essential', { voiceProvider: 'openai' }).valid).toBe(true);
  });
});

describe('advanced analytics are Enterprise only, and the trial has them', () => {
  const sub = (plan: string, status = 'active') => ({ id: 's', tenantId: T, plan, status, stripeSubscriptionId: 'sub_1' });
  it.each([
    ['essential', 'active', false],
    ['professional', 'active', false],
    ['enterprise', 'active', true],
    ['professional', 'trialing', true],
  ])('%s (%s) -> %s', async (plan, status, expected) => {
    vi.spyOn(billingService, 'getActiveSubscription').mockResolvedValue(sub(plan, status) as never);
    expect(await billingService.canUseFeature(T, 'advancedAnalytics')).toBe(expected);
  });

  it('keeps other Professional features on Professional', async () => {
    vi.spyOn(billingService, 'getActiveSubscription').mockResolvedValue(sub('professional') as never);
    expect(await billingService.canUseFeature(T, 'customVoice')).toBe(true);
    expect(await billingService.canUseFeature(T, 'apiAccess')).toBe(true);
  });

  it('reports Enterprise only for a paid Enterprise subscription', async () => {
    vi.spyOn(billingService, 'getActiveSubscription').mockResolvedValue(sub('enterprise') as never);
    expect(await billingService.isEnterprise(T)).toBe(true);
    vi.spyOn(billingService, 'getActiveSubscription').mockResolvedValue(sub('enterprise', 'trialing') as never);
    expect(await billingService.isEnterprise(T)).toBe(false);
  });
});

describe('the WhatsApp add-on gate', () => {
  const withSub = (status: string | null, addon: boolean) => {
    vi.spyOn(billingService, 'getActiveSubscription').mockResolvedValue((status ? { id: 's', tenantId: T, plan: 'professional', status } : null) as never);
    vi.spyOn(billingService, 'hasWhatsAppAddon').mockResolvedValue(addon);
  };

  it('lets everyone through until enforcement is switched on', async () => {
    withSub(null, false);
    expect(await billingService.isWhatsAppAllowed(T)).toBe(true);
  });

  it('once enforced: trial yes, add-on yes, no add-on no, no or lapsed subscription no', async () => {
    process.env.WHATSAPP_ADDON_ENFORCED = 'true';
    withSub('trialing', false);
    expect(await billingService.isWhatsAppAllowed(T)).toBe(true);
    withSub('active', true);
    expect(await billingService.isWhatsAppAllowed(T)).toBe(true);
    withSub('active', false);
    expect(await billingService.isWhatsAppAllowed(T)).toBe(false);
    withSub('past_due', true);
    expect(await billingService.isWhatsAppAllowed(T)).toBe(false);
    withSub('canceled', true);
    expect(await billingService.isWhatsAppAllowed(T)).toBe(false);
    withSub(null, true);
    expect(await billingService.isWhatsAppAllowed(T)).toBe(false);
  });

  it('reads the flag from the tenant record', async () => {
    h.query.mockResolvedValueOnce({ rows: [{ active: true }] });
    expect(await billingService.hasWhatsAppAddon(T)).toBe(true);
    h.query.mockResolvedValueOnce({ rows: [] });
    expect(await billingService.hasWhatsAppAddon(T)).toBe(false);
  });
});

describe('buying and removing the add-on', () => {
  const paid = () => vi.spyOn(billingService, 'getSubscription').mockResolvedValue({ id: 's', tenantId: T, plan: 'professional', status: 'active', stripeSubscriptionId: 'sub_1' } as never);

  it('says it is not on sale yet until the Stripe price is set, and does not touch Stripe', async () => {
    paid();
    await expect(billingService.addWhatsAppAddon(T)).rejects.toBeInstanceOf(BillingNotConfiguredError);
    expect(h.itemCreate).not.toHaveBeenCalled();
  });

  it('needs a paid plan first', async () => {
    process.env.STRIPE_WHATSAPP_ADDON_PRICE_ID = 'price_wa';
    vi.spyOn(billingService, 'getSubscription').mockResolvedValue(null as never);
    await expect(billingService.addWhatsAppAddon(T)).rejects.toThrow(/paid plan/);
  });

  it('adds a prorated item to the subscription and records it', async () => {
    process.env.STRIPE_WHATSAPP_ADDON_PRICE_ID = 'price_wa';
    paid();
    h.retrieve.mockResolvedValue({ status: 'active', items: { data: [{ id: 'si_plan', price: { id: 'price_pro' } }] } });
    h.itemCreate.mockResolvedValue({ id: 'si_wa' });
    h.query.mockResolvedValue({ rows: [] });
    expect(await billingService.addWhatsAppAddon(T)).toEqual({ active: true, stripeItemId: 'si_wa' });
    expect(h.itemCreate).toHaveBeenCalledWith({ subscription: 'sub_1', price: 'price_wa', quantity: 1, proration_behavior: 'create_prorations' });
    const [sql, params] = h.query.mock.calls.at(-1)!;
    expect(String(sql)).toMatch(/jsonb_set/);
    expect(JSON.parse(params[1])).toMatchObject({ active: true, stripeItemId: 'si_wa' });
  });

  it('is safe to call twice: an add-on already on the subscription is reused', async () => {
    process.env.STRIPE_WHATSAPP_ADDON_PRICE_ID = 'price_wa';
    paid();
    h.retrieve.mockResolvedValue({ status: 'active', items: { data: [{ id: 'si_plan', price: { id: 'price_pro' } }, { id: 'si_wa', price: { id: 'price_wa' } }] } });
    h.query.mockResolvedValue({ rows: [] });
    expect(await billingService.addWhatsAppAddon(T)).toEqual({ active: true, stripeItemId: 'si_wa' });
    expect(h.itemCreate).not.toHaveBeenCalled();
  });

  it('removes the item with proration and clears the flag', async () => {
    process.env.STRIPE_WHATSAPP_ADDON_PRICE_ID = 'price_wa';
    paid();
    h.retrieve.mockResolvedValue({ status: 'active', items: { data: [{ id: 'si_plan', price: { id: 'price_pro' } }, { id: 'si_wa', price: { id: 'price_wa' } }] } });
    h.query.mockResolvedValue({ rows: [] });
    expect(await billingService.removeWhatsAppAddon(T)).toEqual({ active: false });
    expect(h.itemDel).toHaveBeenCalledWith('si_wa', { proration_behavior: 'create_prorations' });
    expect(JSON.parse(h.query.mock.calls.at(-1)![1][1])).toMatchObject({ active: false, stripeItemId: null });
  });

  it('changing plan does not mistake the add-on item for the plan or overage item', async () => {
    process.env.STRIPE_WHATSAPP_ADDON_PRICE_ID = 'price_wa';
    process.env.STRIPE_PROFESSIONAL_PRICE_ID = 'price_pro_monthly';
    process.env.STRIPE_PROFESSIONAL_OVERAGE_ID = 'price_pro_over';
    vi.spyOn(billingService, 'getSubscription').mockResolvedValue({ id: 's', tenantId: T, plan: 'essential', status: 'active', stripeSubscriptionId: 'sub_1' } as never);
    // the add-on sits FIRST in the list, which would have been taken as the plan item before
    h.retrieve.mockResolvedValue({
      status: 'active',
      items: { data: [{ id: 'si_wa', price: { id: 'price_wa' } }, { id: 'si_plan', price: { id: 'price_ess', recurring: { interval: 'month' } } }, { id: 'si_over', price: { id: 'price_ess_over' } }] },
    });
    h.update.mockResolvedValue({ status: 'active', current_period_start: 1, current_period_end: 2, cancel_at_period_end: false });
    h.query.mockResolvedValue({ rows: [{ id: 's', tenant_id: T, plan: 'professional', status: 'active' }] });
    vi.spyOn(billingService as any, '_resetUsageForPlanChange').mockResolvedValue(undefined);
    await billingService.updateSubscriptionPlan(T, 'professional').catch(() => undefined);
    const call = h.update.mock.calls[0];
    expect(call?.[1].items).toEqual([
      { id: 'si_plan', price: 'price_pro_monthly' },
      { id: 'si_over', price: 'price_pro_over' },
    ]);
    delete process.env.STRIPE_PROFESSIONAL_PRICE_ID;
    delete process.env.STRIPE_PROFESSIONAL_OVERAGE_ID;
  });
});
