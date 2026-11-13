"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { automationsApi } from "./client";
import { hoursFromMinutes } from "./format";
import type { AutomationStats } from "./types";

export const COST_STORAGE_KEY = "halla.automations.hourlyCost";
const RANGES = [7, 30, 90] as const;

function readCost(): { rate: string; currency: string } {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(COST_STORAGE_KEY) : null;
    const p = raw ? (JSON.parse(raw) as { rate?: unknown; currency?: unknown }) : {};
    return { rate: typeof p.rate === "string" ? p.rate : "", currency: typeof p.currency === "string" && p.currency ? p.currency : "AED" };
  } catch {
    return { rate: "", currency: "AED" };
  }
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card rounded-[var(--radius-lg)] p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {note && <p className="text-xs italic text-muted-foreground">{note}</p>}
    </div>
  );
}

export function StatsTab() {
  const t = useTranslations("pages.automations.stats");
  const tc = useTranslations("pages.automations.common");
  const locale = useLocale();
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [error, setError] = useState(false);
  const [cost, setCost] = useState({ rate: "", currency: "AED" });

  useEffect(() => { setCost(readCost()); }, []);
  useEffect(() => {
    let live = true;
    setStats(null);
    setError(false);
    automationsApi.stats(days).then((s) => live && setStats(s)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [days]);

  function updateCost(next: { rate: string; currency: string }) {
    setCost(next);
    try {
      if (next.rate === "") window.localStorage.removeItem(COST_STORAGE_KEY);
      else window.localStorage.setItem(COST_STORAGE_KEY, JSON.stringify(next));
    } catch { /* private mode: the value just is not remembered */ }
  }

  const rate = Number(cost.rate);
  const hasRate = cost.rate.trim() !== "" && Number.isFinite(rate) && rate >= 0;
  function money(amount: number): string {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: cost.currency.trim().toUpperCase() || "AED", maximumFractionDigits: 0 }).format(amount);
    } catch {
      return `${cost.currency} ${Math.round(amount)}`;
    }
  }

  return (
    <div className="space-y-5">
      <div role="group" aria-label={t("range")} className="flex gap-2">
        {RANGES.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={`h-9 rounded-full border-[1.5px] px-4 text-sm font-medium ${days === d ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-border hover:bg-muted"}`}
          >
            {t(`days${d}` as "days7")}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{tc("loadError")}</p>}
      {!stats && !error && <div aria-busy="true" className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label={t("runs")} value={String(stats.runs)} />
            <Tile label={t("succeeded")} value={String(stats.succeeded)} />
            <Tile label={t("failed")} value={String(stats.failed)} />
            <Tile label={t("waiting")} value={String(stats.waitingApproval)} />
            <Tile label={t("hoursSaved")} value={t("hoursValue", { hours: hoursFromMinutes(stats.minutesSaved) })} note={t("estimateLabel")} />
          </div>
          <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>

          <section className="card rounded-[var(--radius-lg)] p-4">
            <h3 className="text-sm font-semibold text-foreground">{t("perAutomation")}</h3>
            {stats.byAutomation.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("noAutomations")}</p> : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start text-xs text-muted-foreground">
                      <th className="py-1.5 pe-3 text-start font-medium">{t("colAutomation")}</th>
                      <th className="py-1.5 pe-3 text-start font-medium">{t("colRuns")}</th>
                      <th className="py-1.5 pe-3 text-start font-medium">{t("colSucceeded")}</th>
                      <th className="py-1.5 text-start font-medium">{t("colHours")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byAutomation.map((a) => (
                      <tr key={a.automationId} className="border-t border-border">
                        <td className="py-2 pe-3 text-foreground">{a.name}</td>
                        <td className="py-2 pe-3">{a.runs}</td>
                        <td className="py-2 pe-3">{a.succeeded}</td>
                        <td className="py-2">{t("hoursValue", { hours: hoursFromMinutes(a.minutesSaved) })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card rounded-[var(--radius-lg)] p-4">
            <h3 className="text-sm font-semibold text-foreground">{t("costTitle")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("costHelp")}</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("costLabel")}</span>
                <input type="number" min="0" inputMode="decimal" className="h-10 w-36 rounded-xl border border-input bg-[var(--surface-inset)] px-3 text-sm" value={cost.rate} onChange={(e) => updateCost({ ...cost, rate: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("currencyLabel")}</span>
                <input type="text" maxLength={3} dir="ltr" className="h-10 w-24 rounded-xl border border-input bg-[var(--surface-inset)] px-3 text-sm uppercase" value={cost.currency} onChange={(e) => updateCost({ ...cost, currency: e.target.value })} />
              </label>
              {cost.rate !== "" && <button type="button" className="h-10 text-sm font-medium underline underline-offset-2" onClick={() => updateCost({ rate: "", currency: cost.currency })}>{t("clear")}</button>}
            </div>
            {hasRate && (
              <div className="mt-4" aria-live="polite">
                <p className="text-xs text-muted-foreground">{t("valueLabel")}</p>
                <p className="text-2xl font-semibold text-foreground">{money((stats.minutesSaved / 60) * rate)}</p>
                <p className="text-xs italic text-muted-foreground">{t("valueNote")}</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
