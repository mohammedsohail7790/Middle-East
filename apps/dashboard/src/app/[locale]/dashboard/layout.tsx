"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DashboardBootScreen } from "@/components/dashboard/DashboardBootScreen";
import { useRouter, usePathname } from "@/i18n/navigation";
import { supabase } from "@/lib/supabase";
import { AppShell } from "@/components/dashboard-shell/app-shell";
import { setTenantId, getTenantId, syncPlanFromAccount } from "@/lib/store";
import { api, clearAuthCache, prefetchCsrfToken } from "@/lib/api";
import { ensureTenantSession } from "@/lib/ensure-tenant";
import { fetchDashboardBootstrap, warmGatewayWhenReady } from "@/lib/dashboard-bootstrap";
import { TrialUsageBanner, type TrialUsageState } from "@/components/billing/TrialUsageBanner";
import { TrialLockedOverlay } from "@/components/billing/TrialLockedOverlay";
import { DashboardRealtimeProvider } from "@/components/dashboard/DashboardRealtimeProvider";
import { DashboardBillingSync } from "@/components/dashboard/DashboardBillingSync";
import { DashboardToastHost } from "@/components/ui-kit/DashboardToastHost";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import dynamic from "next/dynamic";

const DashboardAssistant = dynamic(
  () =>
    import("@/components/assistant/DashboardAssistant").then((m) => m.DashboardAssistant),
  { ssr: false }
);

function DeferredDashboardAssistant() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setShow(true));
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(() => setShow(true), 2500);
    return () => window.clearTimeout(t);
  }, []);
  if (!show) return null;
  return <DashboardAssistant />;
}

interface AccountState {
  mode: string;
  dashboardReadOnly?: boolean;
  trial?: TrialUsageState;
  subscription?: { plan?: string };
  warnings?: { message: string; warningType: string }[];
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const initStarted = useRef(false);
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    void warmGatewayWhenReady();
    const gateway = (
      process.env.NEXT_PUBLIC_GATEWAY_API_URL || "https://gateway.hallaai.com"
    ).replace(/\/$/, "");
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = gateway;
    preconnect.crossOrigin = "anonymous";
    document.head.appendChild(preconnect);
  }, []);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    let cancelled = false;

    async function loadAccount(user: NonNullable<Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]>) {
      try {
        const [sub, state] = await Promise.all([
          api.get<{ plan?: string; status?: string }>("/billing/subscription"),
          api.get<AccountState>("/billing/account-state"),
        ]);
        let accountState = state;
        if (state?.mode === "none") {
          try {
            accountState = await api.post<AccountState>("/billing/start-trial", {});
            syncDashboardAction("billing");
          } catch {
            /* trial may already exist */
          }
        }
        if (cancelled) return;
        setAccount(accountState);
        syncPlanFromAccount({
          subscriptionPlan: sub?.plan ?? accountState?.subscription?.plan,
          subscriptionStatus: sub?.status,
          isTrialing: accountState?.trial?.isTrialing,
          trialLocked: accountState?.trial?.isLocked ?? accountState?.dashboardReadOnly,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          msg.includes("unavailable") ||
          msg.includes("Cannot reach") ||
          msg.includes("Failed to fetch")
        ) {
          syncPlanFromAccount({ subscriptionPlan: "essential", isTrialing: false });
        }
        if (cancelled) return;
        if (msg.includes("401") || msg.includes("Session expired") || msg.includes("Unauthorized")) {
          setInitError(msg);
        } else if (msg.includes("unavailable") || msg.includes("Cannot reach")) {
          setInitError(msg);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    async function init() {
      setInitError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        routerRef.current.replace("/login");
        return;
      }

      const cachedTenant =
        (user.user_metadata?.tenant_id as string | undefined) ||
        (user.app_metadata?.tenant_id as string | undefined) ||
        getTenantId();

      let tenantId = cachedTenant?.trim() || getTenantId() || null;
      if (!tenantId) {
        tenantId = await ensureTenantSession({ maxWaitMs: 2_000 });
      }
      if (tenantId) setTenantId(tenantId);

      if (!sessionData.session?.access_token) {
        setInitError("No active session — sign in again.");
        if (!cancelled) setReady(true);
        return;
      }

      if (!tenantId) {
        routerRef.current.replace("/onboarding");
        return;
      }

      void prefetchCsrfToken();
      void warmGatewayWhenReady().then(() => fetchDashboardBootstrap(tenantId));

      void loadAccount(user);
    }

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearAuthCache();
      }
      const tid =
        (session?.user?.user_metadata?.tenant_id as string | undefined) ||
        (session?.user?.app_metadata?.tenant_id as string | undefined);
      if (tid) setTenantId(tid);
    });

    const refreshPlan = () => {
      api
        .get<AccountState>("/billing/account-state")
        .then((state) => {
          setAccount(state);
          syncPlanFromAccount({
            subscriptionPlan: state?.subscription?.plan,
            isTrialing: state?.trial?.isTrialing,
            trialLocked: state?.trial?.isLocked ?? state?.dashboardReadOnly,
          });
        })
        .catch(() => {});
    };
    const onFocus = () => refreshPlan();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!ready) {
    return <DashboardBootScreen />;
  }

  const billingAllowed =
    pathname?.startsWith("/dashboard/billing") ||
    pathname?.startsWith("/dashboard/analytics");
  const showLock =
    Boolean(account?.dashboardReadOnly || account?.trial?.isLocked) && !billingAllowed;
  const trialState = account?.trial;

  return (
    <AppShell>
      <DashboardRealtimeProvider>
      <DashboardToastHost />
      <DashboardBillingSync onAccount={setAccount} />
      {initError && (
        <div className="dashboard-alert dashboard-alert-error mb-4" role="alert">
          <p className="font-semibold text-sm"><InitErrorTitle /></p>
          <p className="text-sm mt-0.5">{initError}</p>
        </div>
      )}
      {account?.trial && (
        <TrialUsageBanner trial={account.trial} warnings={account.warnings} />
      )}
      <div className={showLock ? "pointer-events-none select-none opacity-40" : undefined}>
        {children}
      </div>
      {showLock && trialState && <TrialLockedOverlay trial={trialState} />}
      <DeferredDashboardAssistant />
      </DashboardRealtimeProvider>
    </AppShell>
  );
}

function InitErrorTitle() {
  const t = useTranslations("shell");
  return <>{t("apiConnectionIssue")}</>;
}
