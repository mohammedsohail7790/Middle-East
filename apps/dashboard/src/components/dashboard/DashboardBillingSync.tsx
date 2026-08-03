"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { syncPlanFromAccount } from "@/lib/store";
import { useDashboardSync } from "@/lib/dashboard-sync";
import type { TrialUsageState } from "@/components/billing/TrialUsageBanner";

interface AccountState {
  mode: string;
  dashboardReadOnly?: boolean;
  trial?: TrialUsageState;
  subscription?: { plan?: string };
  warnings?: { message: string; warningType: string }[];
}

/** Keeps trial banner + plan gates in sync when Stripe webhooks or checkout complete. */
export function DashboardBillingSync({
  onAccount,
}: {
  onAccount: (state: AccountState) => void;
}) {
  const refresh = useCallback(() => {
    Promise.allSettled([
      api.get<{ plan?: string; status?: string }>("/billing/subscription"),
      api.get<AccountState>("/billing/account-state"),
    ]).then(([sub, acct]) => {
      if (acct.status === "fulfilled") {
        onAccount(acct.value);
        syncPlanFromAccount({
          subscriptionPlan:
            sub.status === "fulfilled"
              ? sub.value?.plan ?? acct.value?.subscription?.plan
              : acct.value?.subscription?.plan,
          subscriptionStatus: sub.status === "fulfilled" ? sub.value?.status : undefined,
          isTrialing: acct.value?.trial?.isTrialing,
          trialLocked: acct.value?.trial?.isLocked ?? acct.value?.dashboardReadOnly,
        });
      }
    });
  }, [onAccount]);

  useDashboardSync(["billing"], refresh);

  return null;
}
