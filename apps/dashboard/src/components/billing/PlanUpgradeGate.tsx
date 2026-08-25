"use client";

import { Link } from "@/i18n/navigation";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { type FeatureKey } from "@/lib/plan-features";

interface PlanUpgradeGateProps {
  feature: FeatureKey;
  title?: string;
  className?: string;
}

/** Full-page or section gate when a plan-restricted feature is unavailable. */
export function PlanUpgradeGate({ feature, title, className }: PlanUpgradeGateProps) {
  const t = useTranslations("gates");
  const tCommon = useTranslations("common");
  return (
    <div
      className={
        className ??
        "flex flex-col items-center justify-center text-center gap-4 rounded-xl border border-border bg-card p-8 sm:p-12 min-h-[280px]"
      }
    >
      <div className="grid size-12 place-items-center rounded-full bg-muted">
        <Lock className="size-5 text-muted-foreground" strokeWidth={ICON_STROKE} aria-hidden />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-semibold text-foreground">
          {title ?? t(`${feature}.title`)}
        </h2>
        <p className="text-sm text-muted-foreground">{t(`${feature}.message`)}</p>
      </div>
      <Link
        href="/dashboard/billing"
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        {tCommon("viewPlans")}
      </Link>
    </div>
  );
}
