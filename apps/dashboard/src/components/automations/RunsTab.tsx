"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { History } from "lucide-react";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { automationsApi } from "./client";
import { errorStatus } from "./errors";
import { formatWhen } from "./format";
import { StatusBadge } from "./StatusBadge";
import type { AutomationRun, LibraryTemplate, RunStatus } from "./types";

const PAGE = 20;
const STATUSES: RunStatus[] = ["succeeded", "failed", "waiting_approval", "running", "skipped", "rejected"];
const SELECT = "h-10 rounded-xl border border-input bg-[var(--surface-inset)] px-3 text-sm text-foreground";

function RunDetail({ runId, library, onChanged }: { runId: string; library: LibraryTemplate[]; onChanged: () => void }) {
  const t = useTranslations("pages.automations.runs");
  const tc = useTranslations("pages.automations.common");
  const locale = useLocale();
  const [run, setRun] = useState<AutomationRun | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    automationsApi.run(runId).then((r) => live && setRun(r)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [runId]);

  if (failed) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t("detailError")}</p>;
  if (!run) return <div aria-busy="true" className="h-16 animate-pulse rounded-xl bg-muted" />;

  const template = library.find((x) => x.automation?.id === run.automationId);
  const titleOf = (key: string, index: number) => template?.steps?.find((s) => s.key === key)?.title ?? t("stepFallback", { number: index + 1 });

  async function retry() {
    setBusy(true);
    setNote(null);
    try {
      await automationsApi.retry(runId);
      setNote({ tone: "ok", text: t("retried") });
      onChanged();
    } catch (err) {
      const s = errorStatus(err);
      const text = s === 501 ? t("retryUnavailable") : s === 409 ? t("retryConflict") : s === 403 ? tc("noPermission") : t("retryFailed");
      setNote({ tone: s === 501 || s === 409 ? "ok" : "error", text });
      if (s === 409) onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <h4 className="text-sm font-semibold text-foreground">{t("stepsTitle")}</h4>
      {run.steps.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">{t("noSteps")}</p> : (
        <ol className="mt-2 space-y-3 border-s border-border ps-4">
          {run.steps.map((s) => (
            <li key={`${s.index}-${s.key}`} className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{titleOf(s.key, s.index)}</span>
                <StatusBadge status={s.status} />
                {s.finishedAt && <span className="text-xs text-muted-foreground">{formatWhen(s.finishedAt, locale)}</span>}
              </div>
              {s.summary && <p className="mt-0.5 text-sm text-muted-foreground">{s.summary}</p>}
              {s.error && <p className="mt-0.5 text-sm text-red-700 dark:text-red-300">{s.error}</p>}
            </li>
          ))}
        </ol>
      )}
      {run.error && <p className="mt-3 text-sm text-red-700 dark:text-red-300"><span className="font-medium">{t("runError")}: </span>{run.error}</p>}
      {run.status === "failed" && (
        <button type="button" className="btn-primary mt-3" disabled={busy} onClick={() => void retry()}>{busy ? t("retrying") : t("retry")}</button>
      )}
      {note && <p role={note.tone === "error" ? "alert" : "status"} className={`mt-2 text-sm ${note.tone === "error" ? "text-red-700 dark:text-red-300" : "text-foreground"}`}>{note.text}</p>}
    </div>
  );
}

export function RunsTab({ library }: { library: LibraryTemplate[] }) {
  const t = useTranslations("pages.automations.runs");
  const tc = useTranslations("pages.automations.common");
  const tt = useTranslations("pages.automations.triggers");
  const ts = useTranslations("pages.automations.runStatus");
  const locale = useLocale();
  const [status, setStatus] = useState("");
  const [automation, setAutomation] = useState("");
  const [runs, setRuns] = useState<AutomationRun[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const rows = await automationsApi.runs({ status: status || undefined, automation: automation || undefined, limit: PAGE, offset: 0 });
      setRuns(rows);
      setMore(rows.length >= PAGE);
    } catch {
      setRuns([]);
      setError(true);
    }
  }, [status, automation]);

  useEffect(() => { setRuns(null); void load(); }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const rows = await automationsApi.runs({ status: status || undefined, automation: automation || undefined, limit: PAGE, offset: runs?.length ?? 0 });
      setRuns((cur) => [...(cur ?? []), ...rows]);
      setMore(rows.length >= PAGE);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const nameOf = (id: string) => library.find((x) => x.automation?.id === id)?.name ?? "";
  const mine = library.filter((x) => x.automation);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">{t("filterStatus")}</span>
          <select className={SELECT} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{ts(s)}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">{t("filterAutomation")}</span>
          <select className={SELECT} value={automation} onChange={(e) => setAutomation(e.target.value)}>
            <option value="">{t("all")}</option>
            {mine.map((x) => <option key={x.key} value={x.automation!.id}>{x.name}</option>)}
          </select>
        </label>
      </div>

      {runs === null && <div aria-busy="true" className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {tc("loadError")}{" "}
          <button type="button" className="font-medium underline" onClick={() => void load()}>{tc("tryAgain")}</button>
        </p>
      )}
      {runs && runs.length === 0 && !error && <EmptyState icon={History} title={t("emptyTitle")} description={t("emptyDescription")} />}
      {runs && runs.length > 0 && (
        <ul className="space-y-3">
          {runs.map((r) => {
            const isOpen = openId === r.id;
            const triggerKey = (r.triggerKind ?? "").replace(/\./g, "_");
            const trigger = triggerKey && tt.has(triggerKey) ? tt(triggerKey) : tt("unknown");
            return (
              <li key={r.id} className="card rounded-[var(--radius-lg)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{nameOf(r.automationId) || tt("unknown")}</p>
                    <p className="text-xs text-muted-foreground">{formatWhen(r.startedAt, locale)} · {trigger}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.minutesSaved > 0 && <span className="text-xs text-muted-foreground">{t("saved")}: {tc("minutesShort", { count: Math.round(r.minutesSaved) })}</span>}
                    <StatusBadge status={r.status} />
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : r.id)} className="text-sm font-medium underline underline-offset-2">
                      {isOpen ? t("hide") : t("open")}
                    </button>
                  </div>
                </div>
                {isOpen && <RunDetail runId={r.id} library={library} onChanged={() => void load()} />}
              </li>
            );
          })}
        </ul>
      )}
      {more && runs && runs.length > 0 && (
        <button type="button" className="inline-flex h-10 items-center rounded-full border-[1.5px] border-border px-5 text-sm font-medium hover:bg-muted" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? t("loadingMore") : t("loadMore")}
        </button>
      )}
    </div>
  );
}
