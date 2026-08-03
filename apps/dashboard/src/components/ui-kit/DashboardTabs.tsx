"use client";

import { cn } from "@/lib/utils";

export type DashboardTab = {
  id: string;
  label: string;
  count?: number;
};

type DashboardTabsProps = {
  tabs: readonly DashboardTab[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
};

export function DashboardTabs({ tabs, activeId, onChange, className }: DashboardTabsProps) {
  return (
    <div className={cn("dashboard-tabs min-w-0 w-full max-w-full", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn("dashboard-tab", activeId === tab.id && "dashboard-tab-active")}
        >
          <span>{tab.label}</span>
          {typeof tab.count === "number" && tab.count > 0 && (
            <span className="dashboard-tab-count">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
