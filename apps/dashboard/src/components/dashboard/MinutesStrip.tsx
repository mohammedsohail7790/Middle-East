"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { minutesOverview, type MinutesOverview } from "@/lib/minutes-usage";

const BAR = { ok: "bg-emerald-500", warn: "bg-amber-500", critical: "bg-red-600" } as const;

/** How many minutes are left this period, under the stat cards on the dashboard home. Hidden until it has real numbers, and when the plan has no minute limit. */
export function MinutesStrip() {
  const t = useTranslations("pages.home");
  const [o, setO] = useState<MinutesOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<unknown>("/billing/account-state")
      .then((s) => {
        if (!cancelled) setO(minutesOverview(s));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!o || !o.hasLimit) return null;

  const headline = o.over > 0 ? t("minutesOver", { count: o.over }) : t("minutesLeft", { count: o.left });
  return (
    <Link href="/dashboard/billing" className="block rounded-2xl border border-border/70 bg-card p-4 shadow-card card-hover" aria-label={t("minutesTitle")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-foreground">{t("minutesTitle")}</p>
        <p className={cn("text-sm font-medium", o.tone === "critical" ? "text-red-600" : o.tone === "warn" ? "text-amber-600" : "text-foreground-secondary")}>{headline}</p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border/60" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={o.percent}>
        <div className={cn("h-full rounded-full transition-all", BAR[o.tone])} style={{ width: `${o.percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-foreground-secondary">
        {t("minutesOf", { used: o.used, limit: o.limit })}
        {o.daysRemaining !== null ? ` · ${t("trialDays", { count: o.daysRemaining })}` : ""}
      </p>
    </Link>
  );
}
