"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconBox, type IconBoxVariant } from "@/components/ui-kit/IconBox";

export type SectionHeaderProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconVariant?: IconBoxVariant;
  actions?: ReactNode;
  className?: string;
  size?: "sm" | "md";
  id?: string;
};

export function SectionHeader({
  title,
  description,
  icon: Icon,
  iconVariant = "accent",
  actions,
  className,
  size = "md",
  id,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0",
        className
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <IconBox
            icon={Icon}
            variant={iconVariant}
            size={size === "sm" ? "sm" : "md"}
            className="mt-0.5"
          />
        )}
        <div className="min-w-0">
          <h2
            id={id}
            className={cn(
              "font-semibold text-foreground tracking-tight",
              size === "sm" ? "text-sm font-semibold" : "text-base sm:text-[1.0625rem]"
            )}
          >
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5 sm:mt-1">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
