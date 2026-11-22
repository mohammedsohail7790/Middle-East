"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Download } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { showDashboardToast } from "@/lib/dashboard-toast";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";

const PAGE_SIZE = 50;

interface AuditRow {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  created_at: string;
}

interface Filters {
  from: string;
  to: string;
  type: string;
  actor: string;
}

const NO_FILTERS: Filters = { from: "", to: "", type: "", actor: "" };

function filterParams(f: Filters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.from) p.from = f.from;
  if (f.to) p.to = f.to;
  if (f.type) p.type = f.type;
  if (f.actor.trim()) p.actor = f.actor.trim();
  return p;
}

export default function AuditHistoryPage() {
  const t = useTranslations("pages.auditHistory");
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await api.getList<AuditRow>("/compliance/audit-events", {
        ...filterParams(applied),
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      setRows(res.items);
      setTotal(res.total);
    } catch {
      // A failed load is shown as an error, never as an empty history.
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [applied, offset, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .get<string[]>("/compliance/audit-event-types")
      .then((list) => setTypes(Array.isArray(list) ? list : []))
      .catch(() => setTypes([]));
  }, []);

  const apply = () => {
    setOffset(0);
    setApplied(draft);
  };

  const reset = () => {
    setDraft(NO_FILTERS);
    setOffset(0);
    setApplied(NO_FILTERS);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams(filterParams(applied)).toString();
      await api.downloadBlob(
        `/compliance/audit-events/export${qs ? `?${qs}` : ""}`,
        `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      );
      showDashboardToast({ type: "success", title: t("exported") });
    } catch {
      showDashboardToast({ type: "error", title: t("exportFailed") });
    } finally {
      setExporting(false);
    }
  };

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + rows.length, total);
  const hasFilters = Object.values(applied).some(Boolean);

  return (
    <DashboardPage
      title={t("title")}
      description={t("description")}
      loading={loading && rows.length === 0 && !error}
      error={error}
      onRetry={() => void load()}
      actions={
        <button type="button" className="btn-ghost" onClick={exportCsv} disabled={exporting}>
          <Download className="h-4 w-4" aria-hidden />
          {exporting ? t("exporting") : t("export")}
        </button>
      }
    >
      <Link href="/dashboard/compliance" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit rtl:flex-row-reverse">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        {t("back")}
      </Link>

      <DashboardPageSection title={t("title")}>
        <form
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("from")}
            <input type="date" className="input" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("to")}
            <input type="date" className="input" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("event")}
            <select className="input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              <option value="">{t("allEvents")}</option>
              {types.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("person")}
            <input
              type="text"
              className="input"
              maxLength={200}
              placeholder={t("personPlaceholder")}
              value={draft.actor}
              onChange={(e) => setDraft({ ...draft, actor: e.target.value })}
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary">
              {t("apply")}
            </button>
            {hasFilters && (
              <button type="button" className="btn-ghost" onClick={reset}>
                {t("reset")}
              </button>
            )}
          </div>
        </form>

        {rows.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground text-start">
                  <th className="py-2 pe-3 text-start font-medium">{t("time")}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t("event")}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t("person")}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t("record")}</th>
                  <th className="py-2 text-start font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-2.5 pe-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</td>
                    <td className="py-2.5 pe-3">
                      <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-muted text-muted-foreground">{ev.event_type}</span>
                    </td>
                    <td className="py-2.5 pe-3 text-xs break-all">{ev.actor_email || ev.actor_id || t("unknownPerson")}</td>
                    <td className="py-2.5 pe-3 text-xs text-muted-foreground">
                      {ev.resource_type}{" "}
                      {ev.resource_id && <code className="font-mono text-[11px]">{ev.resource_id.slice(0, 8)}…</code>}
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground font-mono">{ev.ip_address || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-xs text-muted-foreground">
            <span>{t("showing", { from, to, total })}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                {t("previous")}
              </button>
              <button type="button" className="btn-ghost" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>
                {t("next")}
              </button>
            </div>
          </div>
        )}
      </DashboardPageSection>
    </DashboardPage>
  );
}
