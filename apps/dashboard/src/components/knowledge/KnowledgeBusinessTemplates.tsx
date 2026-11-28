"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Clock,
  Briefcase,
  Save,
  Globe,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  loadKnowledgeTemplates,
  saveKnowledgeTemplates,
} from "@/lib/knowledge-templates-api";
import {
  defaultTemplates,
  WEEKDAYS,
  type KnowledgeTemplates,
} from "@/lib/knowledge-templates";
import { parseServiceText, rowsToText, type ServiceRow } from "@/lib/service-lines";
import { cn } from "@/lib/utils";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { useDashboardSync } from "@/lib/dashboard-sync";

import { DASHBOARD_TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/timezones";

function buildRowsFromTemplates(templates: KnowledgeTemplates): ServiceRow[] {
  const priceByName = new Map<string, string>();
  for (const p of templates.pricing) {
    const key = p.service.trim().toLowerCase();
    if (key) priceByName.set(key, p.price);
  }
  const rows: ServiceRow[] = [];
  const seen = new Set<string>();
  for (const s of templates.services) {
    const name = s.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    rows.push({ name, price: priceByName.get(key) || "" });
    seen.add(key);
  }
  // Carry over any priced item that wasn't also listed as a service.
  for (const p of templates.pricing) {
    const name = p.service.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      rows.push({ name, price: p.price });
      seen.add(key);
    }
  }
  return rows;
}

const DAY_KEYS = ["kbDay0", "kbDay1", "kbDay2", "kbDay3", "kbDay4", "kbDay5", "kbDay6"] as const;

export function KnowledgeBusinessTemplates() {
  const t = useTranslations("pages.businessProfile");
  const [templates, setTemplates] = useState<KnowledgeTemplates>(defaultTemplates());
  const [servicesText, setServicesText] = useState<string>(() =>
    rowsToText(buildRowsFromTemplates(defaultTemplates()))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    return loadKnowledgeTemplates()
      .then((data) => {
        setTemplates(data);
        setServicesText(rowsToText(buildRowsFromTemplates(data)));
      })
      .catch((e: unknown) => {
        if (!opts?.silent) {
          setError(e instanceof Error ? e.message : t("kbLoadFailed"));
        }
      })
      .finally(() => {
        if (!opts?.silent) setLoading(false);
      });
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useDashboardSync(["knowledge", "config", "settings"], () => {
    if (saving) return;
    void load({ silent: true });
  }, { debounceMs: 800 });

  const patchDay = (dayOfWeek: number, patch: Partial<KnowledgeTemplates["officeHours"][0]>) => {
    setTemplates((prev) => ({
      ...prev,
      officeHours: prev.officeHours.map((d) =>
        d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d
      ),
    }));
  };

  const applyWeekdayHoursToAll = () => {
    const monday = templates.officeHours.find((d) => d.dayOfWeek === 1);
    if (!monday) return;
    setTemplates((prev) => ({
      ...prev,
      officeHours: prev.officeHours.map((d) =>
        d.dayOfWeek >= 1 && d.dayOfWeek <= 5
          ? { ...d, startTime: monday.startTime, endTime: monday.endTime, isOpen: monday.isOpen }
          : d
      ),
    }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const namedRows = parseServiceText(servicesText).filter((r) => r.name.trim());
      const payload: KnowledgeTemplates = {
        ...templates,
        services: namedRows.map((r) => ({ name: r.name.trim() })),
        pricing: namedRows
          .filter((r) => r.price.trim())
          .map((r) => ({ service: r.name.trim(), price: r.price.trim() })),
      };
      const saved = await saveKnowledgeTemplates(payload);
      setTemplates(saved);
      setServicesText(rowsToText(buildRowsFromTemplates(saved)));
      setSuccess(t("kbSaved"));
      syncDashboardAction("knowledge");
      syncDashboardAction("config");
      setTimeout(() => setSuccess(""), 5000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("kbSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="dashboard-panel overflow-hidden">
        <div className="p-6 border-b border-border bg-muted/30 animate-pulse">
          <div className="h-6 w-56 bg-muted rounded mb-2" />
          <div className="h-4 w-96 max-w-full bg-muted rounded" />
        </div>
        <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="h-72 bg-muted rounded-xl" />
          <div className="h-72 bg-muted rounded-xl" />
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-panel overflow-hidden mb-10" aria-labelledby="kb-business-heading">
      {/* Section header */}
      <div className="flex flex-col gap-4 p-5 sm:p-6 border-b border-border bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent mb-1">
            {t("kbStep")}
          </p>
          <h2 id="kb-business-heading" className="text-lg font-semibold text-foreground">
            {t("kbHeading")}
          </h2>
          <p className="text-sm text-foreground-secondary mt-1 max-w-xl">
            {t("kbIntro")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary shrink-0 w-full sm:w-auto justify-center"
        >
          <Save className="w-4 h-4" />
          {saving ? t("kbSaving") : t("kbSave")}
        </button>
      </div>

      {(error || success) && (
        <div className="px-5 sm:px-6 pt-4">
          {error && (
            <div
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              {success}
            </div>
          )}
        </div>
      )}

      <div className="p-5 sm:p-6 space-y-6">
        {/* Timezone */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pb-2 border-b border-border/60">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground shrink-0">
            <Globe className="w-4 h-4 text-foreground-tertiary" />
            {t("kbTimezone")}
          </label>
          <select
            value={templates.timezone}
            onChange={(e) => setTemplates((p) => ({ ...p, timezone: e.target.value }))}
            className="input py-2 text-sm sm:max-w-xs"
          >
            {DASHBOARD_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-6">
          {/* Office hours */}
          <div className="rounded-xl border border-border bg-background">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-semibold text-foreground">{t("kbOfficeHours")}</h3>
              </div>
              <button
                type="button"
                onClick={applyWeekdayHoursToAll}
                className="tap-target text-[11px] text-accent hover:underline whitespace-nowrap"
              >
                {t("kbCopyMonday")}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm block sm:table">
                <thead className="hidden sm:table-header-group">
                  <tr className="text-left text-[10px] uppercase tracking-wide text-foreground-tertiary border-b border-border">
                    <th className="px-4 py-2.5 font-medium w-[100px]">{t("kbDay")}</th>
                    <th className="px-2 py-2.5 font-medium">{t("kbOpens")}</th>
                    <th className="px-2 py-2.5 font-medium">{t("kbCloses")}</th>
                    <th className="px-4 py-2.5 font-medium text-center w-16">{t("kbOpen")}</th>
                  </tr>
                </thead>
                <tbody className="block sm:table-row-group">
                  {WEEKDAYS.map((day) => {
                    const row =
                      templates.officeHours.find((h) => h.dayOfWeek === day.dayOfWeek) ??
                      templates.officeHours[day.dayOfWeek];
                    if (!row) return null;
                    return (
                      <tr
                        key={day.dayOfWeek}
                        className={cn(
                          "border-b border-border/50 last:border-0 grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 sm:table-row sm:p-0",
                          !row.isOpen && "bg-muted/30"
                        )}
                      >
                        <td className="order-1 block sm:table-cell sm:px-4 sm:py-2.5 font-medium text-foreground whitespace-nowrap">
                          {t(DAY_KEYS[day.dayOfWeek])}
                        </td>
                        <td className="order-3 block sm:table-cell sm:px-2 sm:py-2">
                          <span className="sm:hidden block text-[10px] uppercase tracking-wide text-foreground-tertiary mb-1">{t("kbOpens")}</span>
                          <input
                            type="time"
                            value={row.startTime}
                            disabled={!row.isOpen}
                            onChange={(e) => patchDay(day.dayOfWeek, { startTime: e.target.value })}
                            className="input py-1.5 text-xs w-full min-w-0 sm:min-w-[7rem]"
                            aria-label={t("kbOpensAria", { day: t(DAY_KEYS[day.dayOfWeek]) })}
                          />
                        </td>
                        <td className="order-4 block sm:table-cell sm:px-2 sm:py-2">
                          <span className="sm:hidden block text-[10px] uppercase tracking-wide text-foreground-tertiary mb-1">{t("kbCloses")}</span>
                          <input
                            type="time"
                            value={row.endTime}
                            disabled={!row.isOpen}
                            onChange={(e) => patchDay(day.dayOfWeek, { endTime: e.target.value })}
                            className="input py-1.5 text-xs w-full min-w-0 sm:min-w-[7rem]"
                            aria-label={t("kbClosesAria", { day: t(DAY_KEYS[day.dayOfWeek]) })}
                          />
                        </td>
                        <td className="order-2 block sm:table-cell text-right sm:text-center sm:px-4 sm:py-2">
                          <input
                            type="checkbox"
                            checked={row.isOpen}
                            onChange={(e) => patchDay(day.dayOfWeek, { isOpen: e.target.checked })}
                            className="rounded border-border max-md:size-6"
                            aria-label={t("kbOpenAria", { day: t(DAY_KEYS[day.dayOfWeek]) })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Services & pricing — free-form, one service per line */}
          <div className="rounded-xl border border-border bg-background flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <Briefcase className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">{t("kbServicesPricing")}</h3>
            </div>
            <div className="p-4 flex-1 flex flex-col gap-2">
              <textarea
                value={servicesText}
                onChange={(e) => setServicesText(e.target.value)}
                rows={10}
                placeholder={t("kbServicesPlaceholder")}
                className="input text-sm resize-y font-mono leading-relaxed"
                aria-label={t("kbServicesAria")}
              />
              <p className="text-[11px] text-muted-foreground">
                {t.rich("kbServicesHint", {
                  code: (chunks) => (
                    <span className="font-mono" dir="ltr">
                      {chunks}
                    </span>
                  ),
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
