"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "@/i18n/navigation";
import { supabase } from "@/lib/supabase";
import { AppShell } from "@/components/calliq/app-shell";
import { setTenantId, getTenantId } from "@/lib/store";
import { clearAuthCache, prefetchCsrfToken } from "@/lib/api";
import { ensureTenantSession } from "@/lib/ensure-tenant";
import { fetchDashboardBootstrap, warmGatewayWhenReady } from "@/lib/dashboard-bootstrap";
import { DashboardRealtimeProvider } from "@/components/dashboard/DashboardRealtimeProvider";
import { DashboardToastHost } from "@/components/ui-kit/DashboardToastHost";
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
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

      if (!cancelled) setReady(true);
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

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <div className="dashboard-boot-screen">
        <div className="dashboard-boot-glow dashboard-boot-glow--tl" aria-hidden />
        <div className="dashboard-boot-glow dashboard-boot-glow--br" aria-hidden />
        <div className="dashboard-boot-card">
          <Image src="/logo.png" alt="Halla AI" width={200} height={72} className="h-16 w-auto max-w-[180px] object-contain" priority />
          <div className="dashboard-boot-dots" role="status" aria-label="Loading">
            <span className="dashboard-boot-dot" style={{ animationDelay: "0ms" }} />
            <span className="dashboard-boot-dot" style={{ animationDelay: "150ms" }} />
            <span className="dashboard-boot-dot" style={{ animationDelay: "300ms" }} />
          </div>
          <p className="dashboard-boot-label">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <DashboardRealtimeProvider>
      <DashboardToastHost />
      {initError && (
        <div className="dashboard-alert dashboard-alert-error mb-4" role="alert">
          <p className="font-semibold text-sm">API connection issue</p>
          <p className="text-sm mt-0.5">{initError}</p>
        </div>
      )}
      {children}
      <DeferredDashboardAssistant />
      </DashboardRealtimeProvider>
    </AppShell>
  );
}
