"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntegrationCategory } from "@/lib/integration-hub-catalog";

export type IntegrationTabId = IntegrationCategory | "all";

type Tab = {
  id: IntegrationTabId;
  label: string;
  icon?: LucideIcon;
  count: number;
};

type Props = {
  tabs: Tab[];
  active: IntegrationTabId;
  onChange: (id: IntegrationTabId) => void;
  className?: string;
};

export function IntegrationCategoryTabs({ tabs, active, onChange, className }: Props) {
  return (
    <div
      className={cn(
        "flex gap-1 overflow-x-auto scrollbar-none border-b border-border bg-muted/20 px-2 sm:px-4",
        className
      )}
      role="tablist"
      aria-label="Integration categories"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative shrink-0 inline-flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium transition-colors",
              "border-b-2 -mb-px",
              selected
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {Icon && <Icon className="size-4 shrink-0 opacity-80" aria-hidden />}
            <span>{tab.label}</span>
            <span
              className={cn(
                "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                selected ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
