"use client";

import { ArrowRight, CheckCircle, Clock, Lock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasAccess } from "@/lib/store";
import { IntegrationIcon } from "@/components/integrations/IntegrationIcon";
import { CATEGORY_LABELS, type IntegrationDef } from "@/lib/integration-hub-catalog";
import type { IntegrationConnectionInfo } from "@/components/integrations/IntegrationConnectWizard";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type Props = {
  integration: IntegrationDef;
  connection?: IntegrationConnectionInfo;
  oauthConfigured: boolean;
  selected: boolean;
  onSelect: () => void;
  variant?: "row" | "card";
};

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "warning" | "error" | "muted" | "accent";
}) {
  const tones = {
    success:
      "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    warning:
      "text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    error: "text-red-700 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
    muted: "text-muted-foreground bg-muted/50 border-border",
    accent: "text-accent bg-accent/10 border-accent/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border whitespace-nowrap",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function IntegrationCard({
  integration,
  connection,
  oauthConfigured: _oauthConfigured,
  selected,
  onSelect,
  variant = "card",
}: Props) {
  const status = connection?.status ?? "disconnected";
  const connected = status === "connected";
  const comingSoonSaved = status === "coming_soon";
  const hasError = status === "error" || (connected && !!connection?.last_error);
  const locked = !!integration.planRequired && !hasAccess(integration.planRequired) && !connected;

  let actionLabel = "Connect";
  if (connected) actionLabel = "Manage";
  else if (comingSoonSaved) actionLabel = "Update";
  else if (!integration.ready) actionLabel = "Set up";

  const statusBadges = (
    <>
      {connected && !hasError && (
        <StatusBadge tone="success">
          <CheckCircle className="w-3 h-3" />
          Connected
        </StatusBadge>
      )}
      {connected && hasError && (
        <StatusBadge tone="warning">
          <AlertTriangle className="w-3 h-3" />
          Needs attention
        </StatusBadge>
      )}
      {!connected && comingSoonSaved && (
        <StatusBadge tone="warning">
          <Clock className="w-3 h-3" />
          Saved
        </StatusBadge>
      )}
      {!connected && status === "error" && (
        <StatusBadge tone="error">
          <AlertTriangle className="w-3 h-3" />
          Error
        </StatusBadge>
      )}
      {locked && !connected && (
        <StatusBadge tone="warning">
          <Lock className="w-3 h-3" />
          {integration.planRequired}
        </StatusBadge>
      )}
    </>
  );

  if (variant === "row") {
    return (
      <div
        className={cn(
          "group flex flex-col sm:flex-row sm:items-center gap-4 px-4 sm:px-5 py-4 transition-colors",
          selected ? "bg-accent/5" : "hover:bg-muted/30"
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <IntegrationIcon id={integration.id} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-foreground">{integration.name}</p>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[integration.category]}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{integration.tagline}</p>
            {connected && connection?.last_test_at && (
              <p className="text-[10px] text-muted-foreground/80 mt-1">
                Verified {timeAgo(connection.last_test_at)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 sm:ml-auto">
          <div className="flex flex-wrap items-center gap-1.5">{statusBadges}</div>
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              "btn-primary text-xs sm:text-sm inline-flex items-center gap-1.5 shrink-0",
              connected && "btn-ghost border border-border"
            )}
          >
            {actionLabel}
            <ArrowRight className="size-3.5" strokeWidth={ICON_STROKE} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex flex-col h-full min-h-[152px] text-left dashboard-panel-padded card-hover !p-4 w-full",
        selected && "ring-2 ring-accent ring-offset-2 ring-offset-background",
        locked && !connected && "opacity-80"
      )}
    >
      <div className="flex items-start gap-3">
        <IntegrationIcon id={integration.id} size="lg" />
        <div className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground leading-tight">
            {integration.name}
          </span>
          <span className="block text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-snug">
            {integration.tagline}
          </span>
        </div>
        {locked && !connected && (
          <Lock className="size-4 text-amber-600 shrink-0 mt-0.5" strokeWidth={1.75} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3 min-h-[22px]">{statusBadges}</div>

      {connected && connection?.last_test_at && (
        <span className="text-[10px] text-muted-foreground/70 mt-1">
          Verified {timeAgo(connection.last_test_at)}
        </span>
      )}

      <span className="mt-auto pt-3 text-xs font-medium text-accent group-hover:underline underline-offset-2">
        {actionLabel}
      </span>
    </button>
  );
}
