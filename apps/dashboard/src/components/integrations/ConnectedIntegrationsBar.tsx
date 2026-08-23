"use client";

import { CheckCircle2 } from "lucide-react";
import { IntegrationIcon } from "@/components/integrations/IntegrationIcon";
import { CATEGORY_LABELS, type IntegrationDef } from "@/lib/integration-hub-catalog";
import type { IntegrationConnectionInfo } from "@/components/integrations/IntegrationConnectWizard";
import { cn } from "@/lib/utils";

type Props = {
  items: IntegrationDef[];
  connections: Record<string, IntegrationConnectionInfo>;
  selectedId: string | null;
  onSelect: (integration: IntegrationDef) => void;
  zapierConnected: boolean;
  onOpenZapier: () => void;
};

export function ConnectedIntegrationsBar({
  items,
  connections,
  selectedId,
  onSelect,
  zapierConnected,
  onOpenZapier,
}: Props) {
  const connected = items.filter((i) => connections[i.id]?.status === "connected");
  const total = connected.length + (zapierConnected ? 1 : 0);

  if (total === 0) return null;

  return (
    <div className="dashboard-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border bg-emerald-50/50 dark:bg-emerald-950/15">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold text-foreground">Active connections</p>
          <span className="text-xs text-muted-foreground tabular-nums">({total})</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 p-3 sm:p-4">
        {connected.map((integration) => {
          const selected = selectedId === integration.id;
          return (
            <button
              key={integration.id}
              type="button"
              onClick={() => onSelect(integration)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                "hover:border-accent/40 hover:bg-accent/5",
                selected
                  ? "border-accent bg-accent/10 ring-1 ring-accent/20"
                  : "border-border bg-background"
              )}
            >
              <IntegrationIcon id={integration.id} size="sm" />
              <span className="text-sm font-medium text-foreground">{integration.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABELS[integration.category]}
              </span>
            </button>
          );
        })}
        {zapierConnected && (
          <button
            type="button"
            onClick={onOpenZapier}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left hover:border-accent/40 hover:bg-accent/5"
          >
            <IntegrationIcon id="zapier" size="sm" />
            <span className="text-sm font-medium text-foreground">Zapier</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Automation</span>
          </button>
        )}
      </div>
    </div>
  );
}
