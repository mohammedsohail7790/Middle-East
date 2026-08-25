"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { IconBox, type IconBoxVariant } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";

export type StatTrend = {
  /** Percent change (e.g. 12.4 for +12.4%). Sign drives direction. */
  value: number;
  /** Optional label after the percent (e.g. "vs last week"). */
  label?: string;
  /** Override auto-direction: `positive` colors green + up arrow, `negative` colors red + down arrow. */
  direction?: "positive" | "negative" | "neutral";
};

export function StatCard({
  label,
  value,
  hint,
  trend,
  sparkline,
  icon: Icon,
  iconVariant = "accent",
  index = 0,
  className,
}: {
  label: string;
  value: string | number;
  /** Optional muted hint under the value. */
  hint?: string;
  /** Signed % trend chip shown next to the value. */
  trend?: StatTrend;
  /** Optional array of numbers for a very subtle sparkline sitting behind the number. */
  sparkline?: number[];
  icon: LucideIcon;
  iconVariant?: IconBoxVariant;
  index?: number;
  className?: string;
}) {
  const direction: "positive" | "negative" | "neutral" =
    trend?.direction ?? (trend ? (trend.value >= 0 ? "positive" : "negative") : "neutral");

  const trendColor =
    direction === "positive"
      ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-900/60"
      : direction === "negative"
        ? "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200/70 dark:border-red-900/60"
        : "text-muted-foreground bg-muted/60 border-border";

  const TrendArrow = direction === "negative" ? ArrowDownRight : ArrowUpRight;
  const trendText =
    trend != null
      ? `${trend.value > 0 ? "+" : ""}${trend.value.toFixed(1)}%`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={cn("dashboard-stat-card min-w-0 group", className)}
    >
      {/* subtle glow blob */}
      <div
        className="pointer-events-none absolute bottom-0 right-0 w-24 h-24 rounded-full opacity-[0.06] dark:opacity-[0.09]"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)", transform: "translate(30%, 30%)" }}
        aria-hidden
      />

      {/* whisper-quiet sparkline behind the number */}
      {sparkline && sparkline.length > 1 && (
        <Sparkline
          values={sparkline}
          direction={direction === "negative" ? "negative" : "positive"}
        />
      )}

      <div className="flex items-start justify-between gap-3 min-w-0 relative">
        <div className="flex-1 min-w-0">
          <p className="dashboard-stat-label">{label}</p>
          <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mt-1">
            <p className="dashboard-stat-value tabular-nums">{value}</p>
            {trendText && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md border tabular-nums shrink-0",
                  trendColor
                )}
                aria-label={`Trend ${trendText}${trend?.label ? ` ${trend.label}` : ""}`}
              >
                <TrendArrow className="size-3 shrink-0" strokeWidth={2.25} />
                {trendText}
              </span>
            )}
          </div>
          {(hint || trend?.label) && (
            <p className="text-xs mt-1.5 truncate text-muted-foreground">
              {trend?.label ?? hint}
            </p>
          )}
        </div>
        <IconBox icon={Icon} variant={iconVariant} size="md" className="shrink-0" />
      </div>
    </motion.div>
  );
}

/** Positioned absolutely — sits behind the numbers as a whisper. */
function Sparkline({
  values,
  direction,
}: {
  values: number[];
  direction: "positive" | "negative";
}) {
  const w = 100;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const step = w / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const stroke = direction === "negative" ? "#EF4444" : "var(--accent)";

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute left-4 right-16 bottom-4 h-8 opacity-[0.18] dark:opacity-[0.22]"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
