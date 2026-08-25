"use client";

import type { LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { IconBox, type IconBoxVariant } from "@/components/ui-kit/IconBox";
import { VibePanel } from "@/components/magic-ui/vibe-panel";

type SupportQuickLinkProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  iconVariant?: IconBoxVariant;
  external?: boolean;
};

export function SupportQuickLink({
  href,
  icon,
  title,
  description,
  iconVariant = "accent",
  external,
}: SupportQuickLinkProps) {
  const inner = (
    <VibePanel className="vibe-settings-card h-full rounded-2xl border border-border/70 bg-card shadow-card">
      <div className="flex items-center gap-4 p-5 sm:p-6">
        <IconBox icon={icon} variant={iconVariant} size="md" className="shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </VibePanel>
  );

  if (external) {
    return (
      <a href={href} className="block no-underline">
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className="block no-underline">
      {inner}
    </Link>
  );
}
