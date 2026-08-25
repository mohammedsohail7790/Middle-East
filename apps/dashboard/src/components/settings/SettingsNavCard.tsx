"use client";

import type { LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { ICON_STROKE, type IconBoxVariant } from "@/components/ui-kit/IconBox";
import { VibePanel } from "@/components/magic-ui/vibe-panel";

type SettingsNavCardProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  iconVariant?: IconBoxVariant;
};

export function SettingsNavCard({
  href,
  icon,
  title,
  description,
  iconVariant = "accent",
}: SettingsNavCardProps) {
  return (
    <Link href={href} className="group block no-underline">
      <VibePanel className="vibe-settings-card rounded-2xl border border-border/70 bg-card shadow-card">
        <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
          <SectionHeader icon={icon} title={title} description={description} iconVariant={iconVariant} />
          <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" strokeWidth={ICON_STROKE} />
        </div>
      </VibePanel>
    </Link>
  );
}
