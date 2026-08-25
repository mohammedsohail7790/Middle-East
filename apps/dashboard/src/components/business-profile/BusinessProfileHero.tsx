"use client";

import { Building2, Briefcase, MapPin } from "lucide-react";
import { AnimatedGradientText } from "@/components/magic-ui/animated-gradient-text";
import { VibePanel } from "@/components/magic-ui/vibe-panel";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";

type BusinessProfileHeroProps = {
  companyName: string;
  services?: string;
  serviceAreaEnabled?: boolean;
};

export function BusinessProfileHero({
  companyName,
  services,
  serviceAreaEnabled,
}: BusinessProfileHeroProps) {
  const displayName = companyName.trim() || "Your business";

  return (
    <VibePanel beam className="mb-6 rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/[0.06] shadow-card">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <IconBox icon={Building2} variant="accent" size="lg" className="shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Business profile
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              <AnimatedGradientText>{displayName}</AnimatedGradientText>
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {services?.trim() || "Train your AI on services, pricing, and service area."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {services?.trim() && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground-secondary">
              <Briefcase className="size-3.5 text-accent" strokeWidth={ICON_STROKE} />
              Services configured
            </span>
          )}
          {serviceAreaEnabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
              <MapPin className="size-3.5" strokeWidth={ICON_STROKE} />
              Service area on
            </span>
          )}
        </div>
      </div>
    </VibePanel>
  );
}
