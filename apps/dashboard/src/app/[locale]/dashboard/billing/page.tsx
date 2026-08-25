"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard, Check, X, Download,
  Phone, MessageSquare, HardDrive, Crown
} from "lucide-react";
import { api, asArray } from "@/lib/api";
import { readApiGetCache } from "@/lib/api-get-cache";
import { fetchBillingPlansState } from "@/lib/public-api";
import {
  formatBillingActionError,
  isStripeNotConfiguredError,
  PAID_BILLING_NOT_CONFIGURED_MSG,
} from "@/lib/billing-messages";
import {
  normalizeBillingUsage,
  normalizeSubscription,
  normalizeInvoice,
  subscriptionNeedsCheckout,
} from "@/lib/gateway-adapters";
import { cn } from "@/lib/utils";
import { setPlan, normalizePlanId } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { useDashboardSync } from "@/lib/dashboard-sync";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";
import { IconBox } from "@/components/ui-kit/IconBox";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { NeonGradientCard } from "@/components/magic-ui/neon-gradient-card";
import { useConfirm } from "@/components/ui-kit/ConfirmDialog";

const BILLING_PORTAL_FLAG = "calliq_billing_portal_return";
const TRIAL_SMS_LIMIT = 500;
const TRIAL_STORAGE_LIMIT_GB = 5;

interface Subscription {
  plan: string;
  status: string;
  current_period_end: string;
  price: number;
  cancelAtPeriodEnd?: boolean;
  stripeSubscriptionId?: string | null;
}

interface Usage {
  minutes: { used: number; limit: number };
  sms: { used: number; limit: number };
  storage: { used: number; limit: number };
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: string;
  pdf_url: string;
}

type BillingInterval = "monthly" | "annual";

type CheckoutPlan = {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  annualEstimated?: boolean;
  features: string[];
  popular?: boolean;
};

const FALLBACK_PLANS: CheckoutPlan[] = [
  {
    id: "essential",
    name: "Essential",
    monthlyPrice: 39,
    annualPrice: 390,
    annualEstimated: true,
    features: ["250 min/mo", "1 phone number", "EN + ES", "Appointment booking", "Lead capture", "Email support"],
  },
  {
    id: "professional",
    name: "Professional",
    monthlyPrice: 149,
    annualPrice: 1490,
    annualEstimated: true,
    features: ["750 min/mo", "3 phone numbers", "CRM + Calendar", "SMS follow-ups", "Analytics & automation", "Team accounts"],
    popular: true,
  },
];

function planFeaturesFromGateway(features: Record<string, unknown> | undefined, includedMinutes: number): string[] {
  if (!features) return [`${includedMinutes} min/mo`];
  const lines: string[] = [`${includedMinutes} min/mo`];
  if (features.callForwarding) lines.push("Call forwarding");
  if (features.appointmentBooking === "native") lines.push("Native appointment booking");
  else if (features.appointmentBooking) lines.push("Appointment booking");
  if (features.calendar === "native") lines.push("Calendar sync");
  if (features.crm === "zapier_full") lines.push("CRM integrations");
  if (features.apiAccess) lines.push("API access");
  if (features.sla) lines.push("SLA");
  return lines.slice(0, 6);
}

function BillingPageContent() {
  const t = useTranslations("billing");
  const { title, description } = useDashboardPageLabels("/dashboard/billing");
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSubscription = readApiGetCache<Subscription>("/billing/subscription");
  const initialUsage = readApiGetCache<Usage>("/billing/usage");
  const [subscription, setSubscription] = useState<Subscription | null>(() =>
    initialSubscription ? normalizeSubscription(initialSubscription) : null
  );
  const [usage, setUsage] = useState<Usage | null>(() =>
    initialUsage ? normalizeBillingUsage(initialUsage) : null
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(!initialSubscription && !initialUsage);
  const [error, setError] = useState("");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [checkoutPlans, setCheckoutPlans] = useState<CheckoutPlan[]>(FALLBACK_PLANS);
  const [checkoutEnabled, setCheckoutEnabled] = useState<boolean | null>(null);
  const [plansChecked, setPlansChecked] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [trialState, setTrialState] = useState<{
    trialMinutesUsed: number;
    trialMinutesLimit: number;
    trialMinutesRemaining: number;
    daysRemaining: number;
    usagePercent: number;
    isTrialing: boolean;
  } | null>(null);

  const loadBilling = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    Promise.allSettled([
      api.get<Subscription>("/billing/subscription"),
      api.get<Usage>("/billing/usage"),
      api.get<Invoice[]>("/billing/invoices"),
      api.get<{ trial?: typeof trialState }>("/billing/account-state"),
    ])
      .then(([sub, usg, inv, acct]) => {
        const failures: string[] = [];
        if (sub.status === "fulfilled") {
          const s = normalizeSubscription(sub.value);
          setSubscription(s);
          if (s.status === "trialing") setPlan("trial");
          else if (s.plan) setPlan(normalizePlanId(s.plan));
        } else if (sub.reason) {
          failures.push(
            sub.reason instanceof Error ? sub.reason.message : String(sub.reason)
          );
        }
        if (usg.status === "fulfilled") {
          setUsage(normalizeBillingUsage(usg.value));
        } else if (usg.reason) {
          failures.push(
            usg.reason instanceof Error ? usg.reason.message : String(usg.reason)
          );
        }
        if (inv.status === "fulfilled") {
          setInvoices(asArray(inv.value).map((row) => normalizeInvoice(row as Record<string, unknown>)));
        }
        if (acct.status === "fulfilled" && acct.value?.trial) {
          const t = acct.value.trial;
          setTrialState({
            trialMinutesUsed: t.trialMinutesUsed,
            trialMinutesLimit: t.trialMinutesLimit,
            trialMinutesRemaining: t.trialMinutesRemaining,
            daysRemaining: t.daysRemaining,
            usagePercent: t.usagePercent,
            isTrialing: t.isTrialing,
          });
          if (t.isTrialing) {
            setUsage({
              minutes: { used: t.trialMinutesUsed, limit: t.trialMinutesLimit },
              sms: { used: 0, limit: TRIAL_SMS_LIMIT },
              storage: { used: 0, limit: TRIAL_STORAGE_LIMIT_GB },
            });
          }
        }
        if (failures.length > 0) {
          setError(failures.join(" · "));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  useEffect(() => {
    fetchBillingPlansState().then((state) => {
      setPlansChecked(true);
      if (!state) return;
      setCheckoutEnabled(state.checkoutEnabled);
      setCheckoutPlans(
        Object.values(state.plans).map((p) => ({
          id: p.key,
          name: p.name,
          monthlyPrice: p.pricing?.monthly?.amount ?? p.price,
          annualPrice: p.pricing?.annual?.amount ?? p.price * 10,
          annualEstimated: p.pricing?.annual?.estimated,
          features: planFeaturesFromGateway(p.features, p.includedMinutes),
          popular: p.badge?.toLowerCase().includes("popular"),
        }))
      );
    });
  }, []);

  useDashboardSync(["billing"], () => loadBilling({ silent: true }), {
    pollMs: 60000,
    pollOnlyWhenDisconnected: true,
  });

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success" || checkout === "cancel") {
      loadBilling();
      syncDashboardAction("billing");
      router.replace("/dashboard/billing", { scroll: false });
    }
  }, [searchParams, loadBilling, router]);

  useEffect(() => {
    const onFocus = () => {
      if (typeof sessionStorage === "undefined") return;
      if (!sessionStorage.getItem(BILLING_PORTAL_FLAG)) return;
      sessionStorage.removeItem(BILLING_PORTAL_FLAG);
      loadBilling();
      syncDashboardAction("billing");
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadBilling]);

  const openBillingPortal = async () => {
    setError("");
    if (checkoutEnabled === false) {
      setError(PAID_BILLING_NOT_CONFIGURED_MSG);
      return;
    }
    try {
      const data = await api.post<{ url: string }>("/billing/portal", {
        returnUrl: typeof window !== "undefined" ? `${window.location.origin}/dashboard/billing` : undefined,
      });
      if (data?.url) {
        sessionStorage.setItem(BILLING_PORTAL_FLAG, "1");
        window.location.href = data.url;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not open billing portal";
      setError(formatBillingActionError(msg));
    }
  };

  const changePlan = async (planId: string, interval: BillingInterval = billingInterval) => {
    setChangingPlan(planId);
    setError("");
    if (checkoutEnabled === false) {
      setError(PAID_BILLING_NOT_CONFIGURED_MSG);
      setChangingPlan(null);
      return;
    }
    try {
      if (subscriptionNeedsCheckout(subscription)) {
        const { data: userData } = await supabase.auth.getUser();
        const email = userData.user?.email;
        if (!email) throw new Error("Sign in required");
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const res = await api.post<{ url: string }>("/billing/checkout-session", {
          plan: planId,
          email,
          billingInterval: interval,
          successUrl: `${origin}/dashboard/billing?checkout=success`,
          cancelUrl: `${origin}/dashboard/billing?checkout=cancel`,
        });
        if (res?.url) {
          window.location.href = res.url;
          return;
        }
        throw new Error("Checkout URL missing");
      }

      await api.put("/billing/subscription/plan", { plan: planId });
      const sub = normalizeSubscription(await api.get<Subscription>("/billing/subscription"));
      if (sub.plan) setPlan(normalizePlanId(sub.plan));
      setSubscription(sub);
      setShowPlanModal(false);
      syncDashboardAction("billing");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update plan";
      setError(
        isStripeNotConfiguredError(msg)
          ? PAID_BILLING_NOT_CONFIGURED_MSG
          : formatBillingActionError(msg)
      );
    } finally {
      setChangingPlan(null);
    }
  };

  const { confirm, confirmDialog } = useConfirm();

  const cancelSubscription = async () => {
    const ok = await confirm({
      title: t("cancelTitle"),
      message: (
        <>
          <p>{t("cancelBody1")}</p>
          <p className="mt-3 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            <strong>{t("cancelLoseTitle")}</strong> {t("cancelLoseBody")}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">{t("cancelPortalHint")}</p>
        </>
      ),
      confirmLabel: t("cancelConfirm"),
      cancelLabel: t("keepSubscription"),
    });
    if (!ok) return;
    setCanceling(true);
    setError("");
    try {
      const sub = normalizeSubscription(await api.del<Subscription>("/billing/subscription"));
      setSubscription(sub);
      syncDashboardAction("billing");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not cancel subscription");
    } finally {
      setCanceling(false);
    }
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === 0) return 0;
    return Math.min(Math.round((used / limit) * 100), 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 70) return "bg-amber-500";
    return "bg-accent";
  };

  return (
    <DashboardPage
      title={title}
      description={description}
      maxWidth="xl"
      loading={loading && !subscription && !usage}
      error={error || undefined}
      actions={
        <button type="button" onClick={openBillingPortal} className="btn-ghost text-sm w-full sm:w-auto justify-center shrink-0">
          {t("managePayment")}
        </button>
      }
    >
      {plansChecked && checkoutEnabled === false && (
        <div className="dashboard-alert border-amber-200 bg-amber-50 dark:bg-amber-950/20 mb-6">
          <p className="text-amber-900 dark:text-amber-200 text-sm font-medium">{t("stripeNotActive")}</p>
          <p className="text-amber-800 dark:text-amber-300 text-xs mt-1">{PAID_BILLING_NOT_CONFIGURED_MSG}</p>
        </div>
      )}

      {trialState?.isTrialing && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-panel-padded mb-6 border-[var(--cyan-border)] bg-gradient-to-r from-background to-[var(--accent-light)]"
        >
          <SectionHeader title={t("trialUsage")} size="sm" className="mb-1" />
          <p className="text-xs text-foreground-secondary mb-4">
            {t("trialDesc", {
              days: trialState.daysRemaining,
              daysSuffix: trialState.daysRemaining === 1 ? "" : "s",
              minutes: trialState.trialMinutesRemaining,
            })}
          </p>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-accent rounded-full"
              style={{ width: `${Math.min(100, trialState.usagePercent)}%`, transition: "width 300ms ease-out" }}
            />
          </div>
          <p className="text-xs text-foreground-tertiary">{t("trialWarnings")}</p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Current Plan */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-panel-padded">
          <div className="flex items-center justify-between mb-4 gap-3">
            <SectionHeader title={t("currentPlan")} size="sm" />
            <IconBox icon={Crown} variant="accent" size="sm" />
          </div>
          {subscription ? (
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-2xl font-bold gradient-text capitalize">{subscription.plan}</span>
                <span className={cn(
                  "px-2 py-0.5 text-xs rounded-full",
                  subscription.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"
                )}>
                  {subscription.status}
                </span>
              </div>
              <p className="text-sm text-foreground-secondary mb-4">
                {t("renews", {
                  price: subscription.price,
                  date: new Date(subscription.current_period_end).toLocaleDateString(),
                })}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowPlanModal(true)} className="btn-primary text-xs">
                  {t("changePlan")}
                </button>
                <button
                  type="button"
                  onClick={() => void cancelSubscription()}
                  disabled={canceling || subscription.status === "canceled"}
                  className="btn-ghost text-xs text-red-600 hover:text-red-300 disabled:opacity-50"
                >
                  {canceling ? t("canceling") : t("cancelSubscription")}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-foreground-tertiary text-sm">{t("noSubscription")}</p>
              <button type="button" onClick={() => setShowPlanModal(true)} className="btn-primary mt-3 text-xs">
                {t("choosePlan")}
              </button>
            </div>
          )}
        </motion.div>

        {/* Usage */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-panel-padded">
          <SectionHeader title={t("usagePeriod")} size="sm" className="mb-4" />
          {usage ? (
            <div className="space-y-4">
              {[
                { label: t("minutes"), icon: Phone, variant: "accent" as const, used: usage.minutes?.used ?? 0, limit: usage.minutes?.limit ?? 0, unit: t("minUnit") },
                { label: t("sms"), icon: MessageSquare, variant: "violet" as const, used: usage.sms?.used ?? 0, limit: usage.sms?.limit ?? 0, unit: t("msgsUnit") },
                { label: t("storage"), icon: HardDrive, variant: "neutral" as const, used: usage.storage?.used ?? 0, limit: usage.storage?.limit ?? 0, unit: t("gbUnit") },
              ].map((item) => {
                const pct = getUsagePercentage(item.used, item.limit);
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <IconBox icon={item.icon} variant={item.variant} size="sm" />
                        <span className="text-sm text-foreground-secondary">{item.label}</span>
                      </div>
                      <span className="text-xs text-foreground-secondary">
                        {item.used} / {item.limit} {item.unit}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1, delay: 0.3 }}
                        className={cn("h-full rounded-full", getUsageColor(pct))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-foreground-tertiary text-sm">{t("noUsageData")}</p>
          )}
        </motion.div>
      </div>

      {/* Invoices */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="dashboard-panel overflow-hidden">
        <div className="p-6 border-b border-border">
          <SectionHeader title={t("invoices")} size="sm" />
        </div>
        {invoices.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={t("noInvoices")}
            description={t("noInvoicesDesc")}
            iconVariant="muted"
          />
        ) : (
          <div className="dashboard-table-wrap">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-foreground-secondary px-6 py-3">{t("date")}</th>
                  <th className="text-left text-xs font-medium text-foreground-secondary px-6 py-3">{t("amount")}</th>
                  <th className="text-left text-xs font-medium text-foreground-secondary px-6 py-3">{t("status")}</th>
                  <th className="text-right text-xs font-medium text-foreground-secondary px-6 py-3">{t("download")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-6 py-4 text-sm text-foreground-secondary">
                      {new Date(invoice.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground font-medium">
                      ${(invoice.amount / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 text-xs rounded-full",
                        invoice.status === "paid" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"
                      )}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {invoice.pdf_url && (
                        <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-dark">
                          <Download className="w-4 h-4 inline" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Change Plan Modal */}
      <AnimatePresence>
        {showPlanModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="dashboard-modal-overlay"
            onClick={() => setShowPlanModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-modal-panel p-6 sm:max-w-3xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">{t("choosePlan")}</h2>
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="text-foreground-secondary hover:text-foreground"
                  aria-label={t("close")}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex justify-center mb-6">
                <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30">
                  <button
                    type="button"
                    onClick={() => setBillingInterval("monthly")}
                    className={cn(
                      "px-4 py-1.5 text-xs font-medium rounded-md transition-colors",
                      billingInterval === "monthly" ? "bg-white shadow text-foreground" : "text-foreground-secondary"
                    )}
                  >
                    {t("monthly")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingInterval("annual")}
                    className={cn(
                      "px-4 py-1.5 text-xs font-medium rounded-md transition-colors",
                      billingInterval === "annual" ? "bg-white shadow text-foreground" : "text-foreground-secondary"
                    )}
                  >
                    {t("annual")}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {checkoutPlans.map((plan) => {
                  const displayPrice =
                    billingInterval === "annual" ? plan.annualPrice : plan.monthlyPrice;
                  const priceSuffix = billingInterval === "annual" ? "/yr" : "/mo";
                  const planBody = (
                    <>
                      {plan.popular && (
                        <span className="text-[10px] font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                          {t("mostPopular")}
                        </span>
                      )}
                      <h3 className="text-lg font-bold text-foreground mt-2">{plan.name}</h3>
                      <div className="flex items-baseline gap-1 mt-1 mb-1">
                        <span className="text-2xl font-bold text-foreground">${displayPrice}</span>
                        <span className="text-sm text-foreground-secondary">{priceSuffix}</span>
                      </div>
                      {billingInterval === "annual" && plan.annualEstimated && (
                        <p className="text-[10px] text-foreground-tertiary mb-3">{t("billedYearly")}</p>
                      )}
                      {billingInterval === "annual" && !plan.annualEstimated && (
                        <p className="text-[10px] text-emerald-600 mb-3">{t("saveVsMonthly")}</p>
                      )}
                      {billingInterval === "monthly" && <div className="mb-3" />}
                      <ul className="space-y-2 mb-4">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-2 text-xs text-foreground-secondary">
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => subscription?.plan !== plan.id && changePlan(plan.id, billingInterval)}
                        className={cn(
                          "w-full text-xs py-2 rounded-lg",
                          subscription?.plan === plan.id ? "btn-ghost" : "btn-primary"
                        )}
                        disabled={subscription?.plan === plan.id || changingPlan === plan.id}
                      >
                        {changingPlan === plan.id
                          ? t("updating")
                          : subscription?.plan === plan.id
                            ? t("currentPlanBtn")
                            : t("selectPlan")}
                      </button>
                    </>
                  );

                  if (plan.popular) {
                    return (
                      <NeonGradientCard
                        key={plan.id}
                        borderRadius={16}
                        className={cn(
                          subscription?.plan === plan.id && "ring-2 ring-accent/40",
                        )}
                      >
                        {planBody}
                      </NeonGradientCard>
                    );
                  }

                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        "p-5 rounded-xl border border-border bg-card",
                        subscription?.plan === plan.id && "ring-2 ring-accent/30"
                      )}
                      style={{ transition: "border-color 200ms ease-out, background-color 200ms ease-out, box-shadow 200ms ease-out" }}
                    >
                      {planBody}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {confirmDialog}
    </DashboardPage>
  );
}

function BillingPageFallback() {
  const { title, description } = useDashboardPageLabels("/dashboard/billing");
  return (
    <DashboardPage title={title} description={description} maxWidth="xl" loading>
      <div />
    </DashboardPage>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingPageFallback />}>
      <BillingPageContent />
    </Suspense>
  );
}
