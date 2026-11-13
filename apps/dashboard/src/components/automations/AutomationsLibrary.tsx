"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { automationsApi } from "./client";
import { errorStatus } from "./errors";
import { DocumentUpload } from "./DocumentUpload";
import { formatWhen } from "./format";
import { OnOffBadge } from "./StatusBadge";
import { DOCUMENT_INTAKE, SettingsPanel } from "./SettingsPanel";
import type { AutomationRun, LibraryTemplate, TenantAutomation } from "./types";

export function AutomationsLibrary() {
  const t = useTranslations("pages.automations.library");
  const tc = useTranslations("pages.automations.common");
  const ts = useTranslations("pages.automations.runStatus");
  const locale = useLocale();
  const [templates, setTemplates] = useState<LibraryTemplate[] | null>(null);
  const [lastRuns, setLastRuns] = useState<Record<string, AutomationRun>>({});
  const [errorKind, setErrorKind] = useState<"forbidden" | "load" | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErrorKind(null);
    try {
      setTemplates(await automationsApi.library());
    } catch (err) {
      setTemplates([]);
      setErrorKind(errorStatus(err) === 403 ? "forbidden" : "load");
      return;
    }
    // One cheap call for the "last run" line on each card. If it fails the cards simply show no line.
    try {
      const runs = await automationsApi.runs({ limit: 100 });
      const map: Record<string, AutomationRun> = {};
      for (const r of runs) if (!map[r.automationId]) map[r.automationId] = r;
      setLastRuns(map);
    } catch {
      setLastRuns({});
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onSaved = (a: TenantAutomation) =>
    setTemplates((cur) => (cur ?? []).map((x) => (x.key === a.templateKey ? { ...x, automation: a } : x)));

  const error = errorKind === null ? undefined : errorKind === "forbidden" ? tc("noPermission") : tc("loadError");
  const open = templates?.find((x) => x.key === openKey) ?? null;
  const intakeOn = templates?.some((x) => x.key === DOCUMENT_INTAKE && x.automation?.enabled) ?? false;

  return (
    <DashboardPage
      title={t("title")}
      description={t("description")}
      loading={templates === null}
      error={error}
      onRetry={() => { setTemplates(null); void load(); }}
      actions={<Link href="/dashboard/automations/activity" className="inline-flex h-10 items-center rounded-full border-[1.5px] border-border px-4 text-sm font-medium hover:bg-muted">{t("viewActivity")}</Link>}
    >
      {templates && templates.length === 0 && !error && (
        <EmptyState icon={Sparkles} title={t("emptyTitle")} description={t("emptyDescription")} />
      )}
      {intakeOn && <div className="mb-6 max-w-xl"><DocumentUpload /></div>}
      {templates && templates.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => {
            const on = tpl.automation?.enabled === true;
            const last = tpl.automation ? lastRuns[tpl.automation.id] : undefined;
            return (
              <li key={tpl.key} className="card flex flex-col rounded-[var(--radius-lg)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold text-foreground">{tpl.name}</h2>
                  <OnOffBadge on={on} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{tpl.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{t("needs")}: </span>
                  {tpl.needs && tpl.needs.length > 0 ? tpl.needs.join(", ") : t("needsNothing")}
                </p>
                {on && <p className="mt-1 text-xs text-muted-foreground">{tpl.automation?.approvalMode === "auto" ? t("approvalAuto") : t("approvalAsk")}</p>}
                {tpl.automation && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{t("lastRun")}: </span>
                    {last ? t("lastRunAt", { status: ts(last.status), when: formatWhen(last.startedAt, locale) }) : t("noRunsYet")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setOpenKey(tpl.key)}
                  aria-label={t("cardAria", { name: tpl.name, state: on ? tc("on") : tc("off") })}
                  className="mt-4 inline-flex h-9 items-center justify-center self-start rounded-full border-[1.5px] border-border px-4 text-sm font-medium hover:bg-muted"
                >
                  {t("open")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <SettingsPanel key={open.key} template={open} onClose={() => setOpenKey(null)} onSaved={onSaved} />}
    </DashboardPage>
  );
}
