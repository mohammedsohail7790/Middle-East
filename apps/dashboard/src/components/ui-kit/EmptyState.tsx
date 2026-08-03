"use client";

import type { LucideIcon } from "lucide-react";
import { IconBox, type IconBoxVariant } from "@/components/ui-kit/IconBox";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  iconVariant = "muted",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  iconVariant?: IconBoxVariant;
}) {
  return (
    <div className="dashboard-empty">
      <div className="mb-6 relative">
        {/* outer glow ring */}
        <div className="absolute inset-0 rounded-[1.75rem] opacity-20 dark:opacity-30"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)", transform: "scale(1.5)" }}
          aria-hidden
        />
        <div className="relative inline-flex rounded-2xl p-1.5 bg-card border border-border/60 shadow-md">
          <IconBox icon={Icon} variant={iconVariant} size="xl" />
        </div>
      </div>
      <p className="font-semibold text-foreground text-base">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-2 max-w-[22rem] mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-6 pt-5 border-t border-border/50 w-full flex justify-center">
          {action}
        </div>
      )}
    </div>
  );
}
