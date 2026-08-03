"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  Calendar,
  CalendarClock,
  Cloud,
  Database,
  GitBranch,
  Gavel,
  HardHat,
  Home,
  Mail,
  MessageSquare,
  Puzzle,
  Scale,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { IconBox, type IconBoxVariant } from "@/components/ui-kit/IconBox";
import type { CrmCatalogId, DirectProviderId } from "@/lib/integrations-catalog";
import { getIntegrationBrand, getIntegrationLogoSources } from "@/lib/integration-brands";
import { cn } from "@/lib/utils";

type IconMeta = { icon: LucideIcon; variant: IconBoxVariant };

const CRM_ICONS: Record<CrmCatalogId, IconMeta> = {
  pipedrive: { icon: GitBranch, variant: "success" },
  zoho: { icon: Database, variant: "error" },
  copper: { icon: Building2, variant: "warning" },
  freshsales: { icon: Sparkles, variant: "warning" },
  insightly: { icon: BarChart3, variant: "accent" },
  servicetitan: { icon: Wrench, variant: "accent" },
  jobber: { icon: HardHat, variant: "violet" },
  housecallpro: { icon: Home, variant: "success" },
  other: { icon: Puzzle, variant: "muted" },
};

const EXTRA_ICONS: Record<string, IconMeta> = {
  salesforce: { icon: Cloud, variant: "accent" },
  clio: { icon: Gavel, variant: "accent" },
  mycase: { icon: Scale, variant: "violet" },
  followupboss: { icon: Users, variant: "success" },
  acuity: { icon: CalendarClock, variant: "accent" },
  setmore: { icon: Calendar, variant: "violet" },
  "square-appointments": { icon: Calendar, variant: "muted" },
  vagaro: { icon: Sparkles, variant: "warning" },
  mindbody: { icon: Users, variant: "accent" },
  buildium: { icon: Building2, variant: "accent" },
  appfolio: { icon: Home, variant: "success" },
  yardi: { icon: Building2, variant: "violet" },
};

const DIRECT_ICONS: Record<DirectProviderId, IconMeta> = {
  zapier: { icon: Sparkles, variant: "warning" },
  "google-calendar": { icon: Calendar, variant: "accent" },
  outlook: { icon: Mail, variant: "accent" },
  calendly: { icon: CalendarClock, variant: "violet" },
  slack: { icon: MessageSquare, variant: "violet" },
  hubspot: { icon: Users, variant: "warning" },
};

const SIZE_CLASS = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
} as const;

const IMG_SIZE = {
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
} as const;

type Props = {
  id: CrmCatalogId | DirectProviderId | string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function IntegrationIcon({ id, size = "md", className }: Props) {
  const brand = getIntegrationBrand(id);
  const sources = useMemo(() => getIntegrationLogoSources(id), [id]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setLogoFailed(false);
  }, [id]);

  const meta =
    (CRM_ICONS as Record<string, IconMeta>)[id] ??
    (DIRECT_ICONS as Record<string, IconMeta>)[id] ??
    EXTRA_ICONS[id] ??
    { icon: Puzzle, variant: "muted" as IconBoxVariant };

  const activeSrc = !logoFailed ? sources[sourceIndex] : undefined;

  if (activeSrc && brand) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-border/50 shadow-sm shrink-0 overflow-hidden",
          SIZE_CLASS[size],
          brand.tileClass,
          "dark:bg-white dark:border-white/30",
          className
        )}
        title={brand.name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeSrc}
          alt=""
          className={cn(IMG_SIZE[size], "object-contain")}
          onError={() => {
            if (sourceIndex < sources.length - 1) {
              setSourceIndex((i) => i + 1);
            } else {
              setLogoFailed(true);
            }
          }}
        />
      </div>
    );
  }

  return (
    <IconBox
      icon={meta.icon}
      variant={meta.variant}
      size={size}
      className={cn(className)}
    />
  );
}
