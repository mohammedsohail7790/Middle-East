"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  RefreshCw,
  Calendar,
  MessageSquare,
  CheckCircle,
  Users,
  Wrench,
  Zap,
  Search,
  Sparkles,
  Plug,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { readApiGetCache } from "@/lib/api-get-cache";
import { showDashboardToast } from "@/lib/dashboard-toast";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { StatCard } from "@/components/ui-kit/StatCard";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import type { IconBoxVariant } from "@/components/ui-kit/IconBox";
import { subscribePlanUpdates } from "@/lib/store";
import { canUseFeature } from "@/lib/plan-features";
import { useDashboardSync } from "@/lib/dashboard-sync";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import {
  IntegrationConnectWizard,
  type IntegrationConnectionInfo,
} from "@/components/integrations/IntegrationConnectWizard";
import {
  IntegrationCategoryTabs,
  type IntegrationTabId,
} from "@/components/integrations/IntegrationCategoryTabs";
import { ConnectedIntegrationsBar } from "@/components/integrations/ConnectedIntegrationsBar";
import { IntegrationHubVisual } from "@/components/integrations/IntegrationHubVisual";
import { ZapierHubSection } from "@/components/integrations/ZapierHubSection";
import {
  CATEGORY_LABELS,
  OAUTH_INTEGRATIONS,
  getIntegrationDef,
  getIntegrationsByCategory,
  filterAvailableOAuthIntegrations,
  searchIntegrations,
  type IntegrationCategory,
  type IntegrationDef,
} from "@/lib/integration-hub-catalog";

type OAuthCapability = {
  provider: string;
  configured: boolean;
  authPath: string;
  callbackUrl: string;
  envVars: string[];
};

type CatalogResponse = { connections: Record<string, IntegrationConnectionInfo> };
type LegacyStatusRow = { provider: string; connected: boolean; last_sync: string | null };

const CATEGORY_ORDER: IntegrationCategory[] = ["crm", "calendar", "field_service", "communication"];

const CATEGORY_ICONS: Record<IntegrationCategory, LucideIcon> = {
  crm: Users,
  calendar: Calendar,
  field_service: Wrench,
  property_management: Users,
  communication: MessageSquare,
  automation: Zap,
};

const CATEGORY_ICON_VARIANTS: Record<IntegrationCategory, IconBoxVariant> = {
  crm: "violet",
  calendar: "accent",
  field_service: "warning",
  property_management: "success",
  communication: "muted",
  automation: "neutral",
};

function isCatalogMissingError(message: string): boolean {
  return /cannot get|not found|404/i.test(message);
}

function needsPostOAuthTest(provider: string): boolean {
  const def = getIntegrationDef(provider);
  if (!def) return false;
  return def.category === "crm" || def.category === "field_service";
}

async function runPostOAuthTest(provider: string): Promise<void> {
  if (!needsPostOAuthTest(provider)) return;
  try {
    await api.post(`/integrations/${provider}/test-lead`, {});
  } catch {
    /* callback may have already tested */
  }
}

function statusRowsToConnections(rows: LegacyStatusRow[]): Record<string, IntegrationConnectionInfo> {
  return Object.fromEntries(
    rows.map((s) => [
      s.provider,
      {
        status: s.connected ? "connected" : "disconnected",
        last_sync_at: s.last_sync,
        last_test_at: null,
        last_error: null,
      },
    ])
  );
}

async function fetchIntegrationConnections(): Promise<Record<string, IntegrationConnectionInfo>> {
  try {
    const data = await api.get<CatalogResponse>("/integrations/catalog");
    return data?.connections ?? {};
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!isCatalogMissingError(message)) throw e;
    const statuses = await api.get<LegacyStatusRow[]>("/integrations/status");
    const rows = Array.isArray(statuses) ? statuses : [];
    return statusRowsToConnections(rows);
  }
}

function sortIntegrationsForList(
  items: IntegrationDef[],
  connections: Record<string, IntegrationConnectionInfo>
): IntegrationDef[] {
  return [...items].sort((a, b) => {
    const aConnected = connections[a.id]?.status === "connected" ? 1 : 0;
    const bConnected = connections[b.id]?.status === "connected" ? 1 : 0;
    if (aConnected !== bConnected) return bConnected - aConnected;
    return a.name.localeCompare(b.name);
  });
}

export default function IntegrationsPage() {
  const t = useTranslations("pages.integrations");
  const tNav = useTranslations("nav");
  const [, setPlanTick] = useState(0);
  const initialCatalog = readApiGetCache<CatalogResponse>("/integrations/catalog");
  const [connections, setConnections] = useState<Record<string, IntegrationConnectionInfo>>(
    initialCatalog?.connections ?? {}
  );
  const [loading, setLoading] = useState(!initialCatalog);
  const [oauthCaps, setOauthCaps] = useState<Record<string, OAuthCapability>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<IntegrationTabId>("all");
  const wizardRef = useRef<HTMLDivElement>(null);

  const crmIntegrationsLocked = !canUseFeature("integrationsProfessional");

  const reloadCatalog = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    return fetchIntegrationConnections()
      .then((map) => setConnections(map))
      .catch((e) => {
        if (!opts?.silent) {
          showDashboardToast({
            type: "error",
            title: "Could not load integrations",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reloadCatalog();
    void api
      .get<OAuthCapability[]>("/integrations/oauth-capabilities")
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        const map: Record<string, OAuthCapability> = {};
        for (const row of list) map[row.provider] = row;
        setOauthCaps(map);
      })
      .catch(() => {});
  }, [reloadCatalog]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider");
    if (params.get("wizard") === "1" && provider) setSelectedId(provider);
    if (window.location.hash === "#zapier-connect") {
      requestAnimationFrame(() => {
        document.getElementById("zapier-connect")?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState({}, "", "/dashboard/integrations");
      });
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider");
    const status = params.get("status");
    if (!provider || !status) return;

    const label = getIntegrationDef(provider)?.name ?? provider.replace(/-/g, " ");

    if (status === "connected") {
      setSelectedId(provider);
      void reloadCatalog().then(async () => {
        await runPostOAuthTest(provider);
        await reloadCatalog({ silent: true });
        showDashboardToast({
          type: "success",
          title: `${label} connected`,
          message: needsPostOAuthTest(provider)
            ? "Test lead sent — check your CRM for the sample record."
            : "Your account is linked and ready to sync.",
        });
        syncDashboardAction("integrations");
      });
    } else if (status === "error") {
      const detail = params.get("message");
      showDashboardToast({
        type: "error",
        title: `Could not connect ${label}`,
        message: detail ? decodeURIComponent(detail) : "Try again or contact support.",
      });
    }

    window.history.replaceState({}, "", "/dashboard/integrations");
  }, [reloadCatalog]);

  useEffect(() => subscribePlanUpdates(() => setPlanTick((n) => n + 1)), []);

  useDashboardSync(["integrations"], () => {
    void reloadCatalog({ silent: true });
  }, { pollMs: 60000, pollOnlyWhenDisconnected: true });

  useEffect(() => {
    if (selectedId && wizardRef.current) {
      wizardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId]);

  const oauthConfiguredMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const [id, cap] of Object.entries(oauthCaps)) map[id] = cap.configured;
    for (const integration of OAUTH_INTEGRATIONS) {
      if (!integration.oauthAuthPath) continue;
      if (map[integration.id] === undefined) map[integration.id] = false;
    }
    return map;
  }, [oauthCaps]);

  const displayableIntegrations = useMemo(
    () => filterAvailableOAuthIntegrations(OAUTH_INTEGRATIONS, oauthConfiguredMap, connections),
    [oauthConfiguredMap, connections]
  );

  const zapierConnected = connections.zapier?.status === "connected";

  const connectedCount = useMemo(
    () =>
      displayableIntegrations.filter((i) => connections[i.id]?.status === "connected").length +
      (zapierConnected ? 1 : 0),
    [connections, displayableIntegrations, zapierConnected]
  );

  const crmConnected = useMemo(
    () =>
      getIntegrationsByCategory("crm").filter((i) => connections[i.id]?.status === "connected").length,
    [connections]
  );

  const calendarConnected = useMemo(
    () =>
      getIntegrationsByCategory("calendar").filter((i) => connections[i.id]?.status === "connected")
        .length,
    [connections]
  );

  const categoryTabs = useMemo(() => {
    const counts: Record<string, number> = { all: displayableIntegrations.length };
    for (const cat of CATEGORY_ORDER) {
      counts[cat] = displayableIntegrations.filter((i) => i.category === cat).length;
    }
    const tabs: {
      id: IntegrationTabId;
      label: string;
      icon?: LucideIcon;
      count: number;
    }[] = [{ id: "all", label: t("allApps"), count: counts.all }];
    for (const cat of CATEGORY_ORDER) {
      if ((counts[cat] ?? 0) > 0) {
        tabs.push({
          id: cat,
          label: CATEGORY_LABELS[cat],
          icon: CATEGORY_ICONS[cat],
          count: counts[cat] ?? 0,
        });
      }
    }
    return tabs;
  }, [displayableIntegrations, t]);

  const visibleIntegrations = useMemo(() => {
    const q = searchQuery.trim();
    let pool = q
      ? filterAvailableOAuthIntegrations(
          searchIntegrations(q),
          oauthConfiguredMap,
          connections
        )
      : displayableIntegrations;
    if (activeTab !== "all") {
      pool = pool.filter((i) => i.category === activeTab);
    }
    return sortIntegrationsForList(pool, connections);
  }, [searchQuery, activeTab, displayableIntegrations, oauthConfiguredMap, connections]);

  const handleSelectIntegration = (integration: IntegrationDef) => {
    setSelectedId((cur) => (cur === integration.id ? null : integration.id));
  };

  const scrollToZapier = () => {
    document.getElementById("zapier-connect")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const runSync = async () => {
    try {
      await api.post("/integrations/sync", {});
      showDashboardToast({
        type: "success",
        title: "Sync started",
        message: "Calendars and CRMs will refresh shortly.",
      });
      syncDashboardAction("integrations");
      void reloadCatalog({ silent: true });
    } catch (e: unknown) {
      showDashboardToast({
        type: "error",
        title: "Sync failed",
        message: e instanceof Error ? e.message : "Could not start sync",
      });
    }
  };

  const selected = selectedId ? getIntegrationDef(selectedId) : null;
  const searchActive = searchQuery.trim().length > 0;

  return (
    <DashboardPage
      title={tNav("integrations")}
      description={tNav("integrationsSubtitle")}
      loading={loading && Object.keys(connections).length === 0}
      actions={
        <button
          type="button"
          onClick={() => void runSync()}
          className="btn-ghost text-sm inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t("syncAll")}
        </button>
      }
    >
      <div className="dashboard-stat-grid dashboard-stat-grid--three">
        <StatCard
          label={t("activeConnections")}
          value={connectedCount}
          icon={CheckCircle}
          iconVariant="success"
          index={0}
        />
        <StatCard label={t("crms")} value={crmConnected} icon={Users} iconVariant="violet" index={1} />
        <StatCard
          label={t("calendars")}
          value={calendarConnected}
          icon={Calendar}
          iconVariant="accent"
          index={2}
        />
      </div>

      <IntegrationHubVisual />

      {crmIntegrationsLocked && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-900/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Sparkles className="size-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 dark:text-amber-200">
              <span className="font-medium">{t("essentialBanner")}</span> {t("essentialBannerBody")}
            </p>
          </div>
          <Link href="/dashboard/billing" className="btn-primary text-xs shrink-0 self-start sm:self-center">
            {t("upgrade")}
          </Link>
        </div>
      )}

      <ConnectedIntegrationsBar
        items={displayableIntegrations}
        connections={connections}
        selectedId={selectedId}
        onSelect={handleSelectIntegration}
        zapierConnected={zapierConnected}
        onOpenZapier={scrollToZapier}
      />

      <div id="zapier-connect">
        <DashboardPageSection
          step={t("zapierStep")}
          title={t("zapierTitle")}
          description={t("zapierDesc")}
          icon={Zap}
          iconVariant="neutral"
        >
          <ZapierHubSection
            connected={zapierConnected}
            onConnectedChange={() => void reloadCatalog({ silent: true })}
          />
        </DashboardPageSection>
      </div>

      <DashboardPageSection
        step={t("directoryStep")}
        title={t("directoryTitle")}
        description={t("directoryDesc")}
        icon={Plug}
        iconVariant="violet"
      >
        <div className="dashboard-panel overflow-hidden">
          {displayableIntegrations.length > 0 && (
            <IntegrationCategoryTabs
              tabs={categoryTabs}
              active={activeTab}
              onChange={setActiveTab}
            />
          )}

          <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border bg-background">
            <Search className="size-4 text-muted-foreground shrink-0" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label={t("searchPlaceholder")}
            />
          </div>

          <AnimatePresence>
            {selected && (
              <motion.div
                ref={wizardRef}
                id="integration-setup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="border-b border-border bg-muted/10"
              >
                <div className="px-4 sm:px-5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("setup", { name: selected.name })}
                  </p>
                </div>
                <IntegrationConnectWizard
                  integration={selected}
                  connection={connections[selected.id]}
                  oauthConfigured={oauthConfiguredMap[selected.id] ?? false}
                  onStatusChange={() => void reloadCatalog({ silent: true })}
                  onClose={() => setSelectedId(null)}
                  embedded
                />
              </motion.div>
            )}
          </AnimatePresence>

          {visibleIntegrations.length > 0 ? (
            <div className="divide-y divide-border">
              {visibleIntegrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  variant="row"
                  integration={integration}
                  connection={connections[integration.id]}
                  oauthConfigured={oauthConfiguredMap[integration.id] ?? false}
                  selected={selectedId === integration.id}
                  onSelect={() => handleSelectIntegration(integration)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Plug}
              iconVariant="muted"
              title={searchActive ? t("noMatch") : t("noApps")}
              description={
                searchActive
                  ? t("noMatchDesc")
                  : t("noAppsDesc")
              }
            />
          )}
        </div>
      </DashboardPageSection>
    </DashboardPage>
  );
}
