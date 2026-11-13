"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { StepStatus } from "./types";

const TONE: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  waiting_approval: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  rejected: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  skipped: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function StatusBadge({ status }: { status: StepStatus }) {
  const t = useTranslations("pages.automations.runStatus");
  const known = status in TONE;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", TONE[status] ?? TONE.pending)}>
      {known ? t(status) : status}
    </span>
  );
}

export function OnOffBadge({ on }: { on: boolean }) {
  const t = useTranslations("pages.automations.common");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        on ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      )}
    >
      {on ? t("on") : t("off")}
    </span>
  );
}
