"use client";

import { useCallback, useEffect, useState } from "react";
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

/** One combined row — name is required, price is optional. Derived into the
 *  separate services[]/pricing[] arrays the API expects on save. */
type ServiceRow = { name: string; price: string };

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

/** One service per line: "AC repair - $89" or just "AC repair" (no price). */
function rowsToText(rows: ServiceRow[]): string {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => (r.price.trim() ? `${r.name} - $${r.price.trim()}` : r.name))
    .join("\n");
}

function parseServiceText(text: string): ServiceRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*\S)\s*[-–,]\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*$/);
      if (match) {
        return { name: match[1].trim(), price: match[2] };
      }
      const trailingPrice = line.match(/^(.*\S)\s+\$\s*(\d+(?:\.\d{1,2})?)\s*$/);
      if (trailingPrice) {
        return { name: trailingPrice[1].trim(), price: trailingPrice[2] };
      }
      return { name: line, price: "" };
    });
}
import { cn } from "@/lib/utils";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { useDashboardSync } from "@/lib/dashboard-sync";

import { DASHBOARD_TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/timezones";

export function KnowledgeBusinessTemplates() {
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
          setError(e instanceof Error ? e.message : "Could not load templates");
        }
      })
      .finally(() => {
        if (!opts?.silent) setLoading(false);
      });
  }, []);

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
      setSuccess("Saved — your agent will use these hours, services, and prices on calls.");
      syncDashboardAction("knowledge");
      syncDashboardAction("config");
      setTimeout(() => setSuccess(""), 5000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
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
            Step 1 · Business info
          </p>
          <h2 id="kb-business-heading" className="text-lg font-semibold text-foreground">
            Hours, services & pricing
          </h2>
          <p className="text-sm text-foreground-secondary mt-1 max-w-xl">
            What callers ask about most. Fill each section — your AI and calendar stay in sync when
            you save.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary shrink-0 w-full sm:w-auto justify-center"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save business info"}
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
            Timezone
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
                <h3 className="text-sm font-semibold text-foreground">Office hours</h3>
              </div>
              <button
                type="button"
                onClick={applyWeekdayHoursToAll}
                className="text-[11px] text-accent hover:underline whitespace-nowrap"
              >
                Apply Mon to weekdays
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-foreground-tertiary border-b border-border">
                    <th className="px-4 py-2.5 font-medium w-[100px]">Day</th>
                    <th className="px-2 py-2.5 font-medium">Opens</th>
                    <th className="px-2 py-2.5 font-medium">Closes</th>
                    <th className="px-4 py-2.5 font-medium text-center w-16">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAYS.map((day) => {
                    const row =
                      templates.officeHours.find((h) => h.dayOfWeek === day.dayOfWeek) ??
                      templates.officeHours[day.dayOfWeek];
                    if (!row) return null;
                    return (
                      <tr
                        key={day.dayOfWeek}
                        className={cn(
                          "border-b border-border/50 last:border-0",
                          !row.isOpen && "bg-muted/30"
                        )}
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">
                          {day.label}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="time"
                            value={row.startTime}
                            disabled={!row.isOpen}
                            onChange={(e) => patchDay(day.dayOfWeek, { startTime: e.target.value })}
                            className="input py-1.5 text-xs w-full min-w-[7rem]"
                            aria-label={`${day.label} opens`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="time"
                            value={row.endTime}
                            disabled={!row.isOpen}
                            onChange={(e) => patchDay(day.dayOfWeek, { endTime: e.target.value })}
                            className="input py-1.5 text-xs w-full min-w-[7rem]"
                            aria-label={`${day.label} closes`}
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={row.isOpen}
                            onChange={(e) => patchDay(day.dayOfWeek, { isOpen: e.target.checked })}
                            className="rounded border-border"
                            aria-label={`${day.label} open`}
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
              <h3 className="text-sm font-semibold text-foreground">Services & pricing</h3>
            </div>
            <div className="p-4 flex-1 flex flex-col gap-2">
              <textarea
                value={servicesText}
                onChange={(e) => setServicesText(e.target.value)}
                rows={10}
                placeholder={
                  "One service per line. Add a price if you want the AI to quote it:\n\nAC repair - $89\nFurnace installation\nMaintenance plan - $19/month"
                }
                className="input text-sm resize-y font-mono leading-relaxed"
                aria-label="Services and pricing, one per line"
              />
              <p className="text-[11px] text-muted-foreground">
                One service per line. Price is optional — add it as <span className="font-mono">- $89</span> at
                the end of a line if you want the AI to quote it on calls.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
