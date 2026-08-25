"use client";

import type { LucideIcon } from "lucide-react";
import { Pencil, Play } from "lucide-react";
import { IconBox, ICON_STROKE, type IconBoxVariant } from "@/components/ui-kit/IconBox";
import { VibePanel } from "@/components/magic-ui/vibe-panel";
import { cn } from "@/lib/utils";

type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled";

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft: "bg-muted text-foreground-secondary",
  scheduled: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  running: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  paused: "bg-muted text-foreground-secondary",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  cancelled: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

type OutboundCampaignRowProps = {
  name: string;
  status: CampaignStatus;
  progressLabel: string;
  icon: LucideIcon;
  iconVariant: IconBoxVariant;
  onEdit?: () => void;
  onStart?: () => void;
  starting?: boolean;
  editLabel: string;
  startLabel: string;
  startingLabel: string;
};

export function OutboundCampaignRow({
  name,
  status,
  progressLabel,
  icon,
  iconVariant,
  onEdit,
  onStart,
  starting,
  editLabel,
  startLabel,
  startingLabel,
}: OutboundCampaignRowProps) {
  const isRunning = status === "running";

  return (
    <VibePanel
      beam={isRunning}
      className={cn(
        "vibe-campaign-card rounded-xl border border-border bg-card",
        isRunning && "is-running",
      )}
    >
      <div className="flex flex-wrap items-center gap-3 p-4">
        <IconBox icon={icon} variant={iconVariant} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                STATUS_BADGE[status],
              )}
            >
              {status}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{progressLabel}</p>
        </div>
        {(status === "draft" || status === "paused") && (
          <div className="flex items-center gap-2">
            {status === "draft" && onEdit && (
              <button type="button" onClick={onEdit} className="btn-ghost !px-3 !py-1.5 text-sm">
                <Pencil className="size-3.5" strokeWidth={ICON_STROKE} /> {editLabel}
              </button>
            )}
            {onStart && (
              <button
                type="button"
                onClick={onStart}
                disabled={starting}
                className="btn-ghost !px-3 !py-1.5 text-sm"
              >
                {starting ? (
                  startingLabel
                ) : (
                  <>
                    <Play className="size-3.5" strokeWidth={ICON_STROKE} /> {startLabel}
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </VibePanel>
  );
}
