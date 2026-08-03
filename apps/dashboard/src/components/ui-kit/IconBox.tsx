"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const ICON_STROKE = 1.75;

export const iconBoxVariants = cva(
  "shrink-0 grid place-items-center rounded-xl transition-all duration-200 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        accent: "icon-box-accent",
        muted: "icon-box-muted",
        success: "icon-box-success",
        warning: "icon-box-warning",
        error: "icon-box-error",
        violet: "icon-box-violet",
        neutral: "icon-box-neutral",
      },
      size: {
        sm: "size-8 [&_svg]:size-3.5",
        md: "size-10 [&_svg]:size-[18px]",
        lg: "size-12 [&_svg]:size-5",
        xl: "size-14 [&_svg]:size-6",
      },
    },
    defaultVariants: {
      variant: "accent",
      size: "md",
    },
  }
);

export type IconBoxVariant = NonNullable<VariantProps<typeof iconBoxVariants>["variant"]>;

type IconBoxProps = VariantProps<typeof iconBoxVariants> & {
  icon: LucideIcon;
  className?: string;
  strokeWidth?: number;
  children?: ReactNode;
};

export function IconBox({
  icon: Icon,
  variant,
  size,
  className,
  strokeWidth = ICON_STROKE,
}: IconBoxProps) {
  return (
    <div className={cn(iconBoxVariants({ variant, size }), className)} aria-hidden>
      <Icon strokeWidth={strokeWidth} />
    </div>
  );
}

export function outcomeIconVariant(
  outcome: string | null | undefined
): IconBoxVariant {
  switch (outcome) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "transferred":
      return "warning";
    default:
      return "muted";
  }
}
