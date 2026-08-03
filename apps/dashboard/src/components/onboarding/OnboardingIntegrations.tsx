"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plug, Search } from "lucide-react";
import { api } from "@/lib/api";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingShell";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import {
  IntegrationConnectWizard,
  type IntegrationConnectionInfo,
} from "@/components/integrations/IntegrationConnectWizard";
import {
  OAUTH_INTEGRATIONS,
  filterAvailableOAuthIntegrations,
  searchIntegrations,
  type IntegrationCategory,
  type IntegrationDef,
} from "@/lib/integration-hub-catalog";

const ONBOARDING_CATEGORIES: IntegrationCategory[] = ["crm", "calendar"];

type OAuthCapability = {
  provider: string;
  configured: boolean;
};

type Props = {
  onProgress: () => void;
};

function onboardingIntegrations(
  oauthConfigured: Record<string, boolean>,
  connections: Record<string, IntegrationConnectionInfo>
): IntegrationDef[] {
  return filterAvailableOAuthIntegrations(
    OAUTH_INTEGRATIONS.filter(
      (i) => !i.isAdvanced && i.ready && ONBOARDING_CATEGORIES.includes(i.category)
    ),
    oauthConfigured,
    connections
  );
}

export function OnboardingIntegrations({ onProgress }: Props) {
  const [connections, setConnections] = useState<Record<string, IntegrationConnectionInfo>>({});
  const [oauthCaps, setOauthCaps] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (): Promise<Record<string, IntegrationConnectionInfo>> => {
    try {
      const [catalog, caps] = await Promise.all([
        api.get<{ connections: Record<string, IntegrationConnectionInfo> }>("/integrations/catalog").catch(() => null),
        api.get<OAuthCapability[]>("/integrations/oauth-capabilities").catch(() => []),
      ]);
      const map = catalog?.connections ?? {};
      setConnections(map);
      const oauthMap: Record<string, boolean> = {};
      for (const row of Array.isArray(caps) ? caps : []) oauthMap[row.provider] = row.configured;
      for (const i of OAUTH_INTEGRATIONS) {
        if (i.oauthAuthPath && oauthMap[i.id] === undefined) oauthMap[i.id] = false;
      }
      setOauthCaps(oauthMap);
      return map;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const items = useMemo(() => {
    const base = onboardingIntegrations(oauthCaps, connections);
    const q = searchQuery.trim();
    if (!q) return base;
    const ids = new Set(
      filterAvailableOAuthIntegrations(searchIntegrations(q), oauthCaps, connections).map(
        (i) => i.id
      )
    );
    return base.filter((i) => ids.has(i.id));
  }, [searchQuery, oauthCaps, connections]);

  const connectedCount = useMemo(
    () => items.filter((i) => connections[i.id]?.status === "connected").length,
    [items, connections]
  );

  const reportProgress = useCallback(
    async (integration: IntegrationDef) => {
      const body =
        integration.category === "calendar"
          ? { calendarConnected: true, step: "calendar" as const }
          : { crmConnected: true, step: "crm" as const };
      try {
        await api.post("/onboarding/progress", body);
      } catch {
        /* best-effort */
      }
      onProgress();
    },
    [onProgress]
  );

  const handleStatusChange = useCallback(
    (integration: IntegrationDef) => {
      void reload().then((map) => {
        if (map[integration.id]?.status === "connected") {
          void reportProgress(integration);
        }
      });
    },
    [reload, reportProgress]
  );

  const selected = selectedId ? items.find((i) => i.id === selectedId) : null;

  return (
    <div className="space-y-5">
      <OnboardingStepHeader
        icon={Plug}
        title="Connect your CRM or calendar"
        description="Pick the app you already use. Most connect with one click — otherwise we show you exactly what to copy and paste. No technical knowledge needed."
      />

      {connectedCount > 0 && (
        <p className="text-xs text-center text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {connectedCount} app{connectedCount === 1 ? "" : "s"} connected — you&apos;re good to go.
        </p>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search HubSpot, Google Calendar…"
          className="input w-full pl-9"
          aria-label="Search apps to connect"
        />
      </div>

      {selected && (
        <IntegrationConnectWizard
          integration={selected}
          connection={connections[selected.id]}
          oauthConfigured={oauthCaps[selected.id] ?? true}
          onStatusChange={() => handleStatusChange(selected)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {loading ? (
        <p className="text-sm text-center text-muted-foreground py-6">Loading apps…</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              connection={connections[integration.id]}
              oauthConfigured={oauthCaps[integration.id] ?? true}
              selected={selectedId === integration.id}
              onSelect={() => setSelectedId((cur) => (cur === integration.id ? null : integration.id))}
            />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <p className="text-sm text-center text-muted-foreground py-4">No apps match your search.</p>
      )}
    </div>
  );
}
