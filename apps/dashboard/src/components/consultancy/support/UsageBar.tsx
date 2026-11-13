"use client";

import type { Usage } from "./types";

/** Hours used of hours included for the month. Turns red when the month is over the plan. */
export function UsageBar({ usage }: { usage: Usage }) {
  const width = Math.min(100, usage.percent);
  return (
    <div className="min-w-[140px]">
      <div
        role="progressbar"
        aria-valuenow={width}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={`h-full ${usage.over ? "bg-red-600" : "bg-emerald-600"}`} style={{ width: `${width}%` }} />
      </div>
      <p className={`mt-1 text-xs ${usage.over ? "font-medium text-red-600" : "text-muted-foreground"}`}>
        {usage.usedHours} of {usage.includedHours} hours{usage.over ? " (over)" : ""}
      </p>
    </div>
  );
}
