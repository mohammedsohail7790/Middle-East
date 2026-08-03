"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionHeader, type SectionHeaderProps } from "@/components/ui-kit/SectionHeader";

type Props = {
  step?: string;
  title?: string;
  description?: string;
  icon?: LucideIcon;
  iconVariant?: SectionHeaderProps["iconVariant"];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  id?: string;
};

export function DashboardPageSection({
  step,
  title,
  description,
  icon,
  iconVariant,
  actions,
  children,
  className,
  headerClassName,
  id,
}: Props) {
  return (
    <section className={cn("dashboard-page-section", className)} aria-labelledby={id}>
      {(step || title) && (
        <div className={cn("space-y-2", headerClassName)}>
          {step && <p className="dashboard-step-label">{step}</p>}
          {title && (
            <SectionHeader
              id={id}
              title={title}
              description={description}
              icon={icon}
              iconVariant={iconVariant}
              actions={actions}
            />
          )}
        </div>
      )}
      {children}
    </section>
  );
}
