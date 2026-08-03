"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardSectionProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
};

export function DashboardSection({
  title,
  description,
  actions,
  children,
  className,
  padded = true,
}: DashboardSectionProps) {
  return (
    <section className={cn(padded ? "dashboard-panel-padded" : "dashboard-panel", className)}>
      {(title || description || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5 min-w-0">
          <div className="min-w-0">
            {title && <h2 className="dashboard-section-title">{title}</h2>}
            {description && <p className="dashboard-section-description">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
