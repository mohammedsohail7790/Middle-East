"use client";

import { Info } from "lucide-react";
import { getWizardRequirementNotes, type IntegrationDef } from "@/lib/integration-hub-catalog";

type Props = {
  integration: IntegrationDef;
  variant?: "info" | "warning";
};

export function IntegrationWizardRequirements({ integration, variant = "info" }: Props) {
  const notes = getWizardRequirementNotes(integration);
  if (!notes.length) return null;

  const styles =
    variant === "warning"
      ? "text-amber-900 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200"
      : "text-slate-800 bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-700 dark:text-slate-200";

  return (
    <div className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${styles}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1.5">
        <Info className="size-3.5 shrink-0" />
        Before you connect
      </p>
      <ul className="text-xs leading-relaxed space-y-1 list-disc list-inside marker:text-current/70">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
