"use client";

import { Link } from "@/i18n/navigation";
import { AlertTriangle, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrialUsageState {
  isTrialing: boolean;
  isLocked: boolean;
  trialMinutesUsed: number;
  trialMinutesLimit: number;
  trialMinutesRemaining: number;
  daysRemaining: number;
  usagePercent: number;
  blockReason?: string | null;
}

interface Warning {
  message: string;
  warningType: string;
}

export function TrialUsageBanner({
  trial,
  warnings = [],
}: {
  trial: TrialUsageState;
  warnings?: Warning[];
}) {
  if (!trial.isTrialing && !trial.isLocked) return null;

  const pct = Math.min(100, trial.usagePercent);
  const urgent = pct >= 92 || trial.trialMinutesRemaining <= 5;

  if (trial.isLocked) return null;

  return (
    <div
      className={cn(
        "mt-4 w-full max-w-full rounded-2xl border p-4 lg:p-5",
        urgent
          ? "border-amber-300/60 bg-gradient-to-r from-amber-50 to-orange-50"
          : "border-accent/20 bg-gradient-to-r from-slate-50 to-indigo-50/40"
      )}
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start gap-3">
          {urgent ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <Zap className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              Free trial — Professional features
            </p>
            <p className="text-xs text-foreground-secondary mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
              <span>
                <strong>{trial.trialMinutesUsed}</strong> / {trial.trialMinutesLimit} minutes used
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {trial.daysRemaining} day{trial.daysRemaining === 1 ? "" : "s"} left
              </span>
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/billing"
          className="btn-primary text-xs py-2 px-4 shrink-0 self-start lg:self-center"
        >
          Upgrade now
        </Link>
      </div>

      <div className="mt-3 h-2 rounded-full bg-black/5 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            urgent ? "bg-amber-500" : "bg-accent"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {warnings[0] && (
        <p className="text-xs text-amber-800 mt-2">{warnings[0].message}</p>
      )}
    </div>
  );
}
