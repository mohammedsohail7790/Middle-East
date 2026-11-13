"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { automationsApi } from "./client";
import { AutomationsApiError } from "./errors";
import { ConfigForm } from "./ConfigForm";
import { DocumentUpload } from "./DocumentUpload";
import { buildConfig, initialConfigValues } from "./format";
import type { ApprovalMode, LibraryTemplate, TenantAutomation } from "./types";

export const DOCUMENT_INTAKE = "document-intake";

/** The settings of one automation: switch, approval choice, the generated form, and Save. */
export function SettingsPanel({
  template, onClose, onSaved,
}: {
  template: LibraryTemplate;
  onClose: () => void;
  onSaved: (automation: TenantAutomation) => void;
}) {
  const t = useTranslations("pages.automations.panel");
  const tc = useTranslations("pages.automations.common");
  const fields = template.config ?? [];
  const saved = template.automation;
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [mode, setMode] = useState<ApprovalMode>(saved?.approvalMode ?? "ask");
  const [values, setValues] = useState(() => initialConfigValues(fields, saved?.config));
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    setBusy(true);
    setDetails([]);
    setMessage(null);
    try {
      const result = await automationsApi.save(template.key, { enabled, approvalMode: mode, config: buildConfig(fields, values) });
      onSaved(result);
      setMessage({ tone: "ok", text: t("saved") });
    } catch (err) {
      if (err instanceof AutomationsApiError && err.status === 403) setMessage({ tone: "error", text: tc("noPermission") });
      else if (err instanceof AutomationsApiError && err.status === 400) {
        setDetails(err.details);
        if (err.details.length === 0) setMessage({ tone: "error", text: err.message });
      } else setMessage({ tone: "error", text: tc("loadError") });
    } finally {
      setBusy(false);
    }
  }

  function onSaveClick() {
    // Going to "Run by itself" is the one change worth a second look.
    if (mode === "auto" && saved?.approvalMode !== "auto") setConfirming(true);
    else void save();
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="automation-panel-title"
        className="h-full w-full max-w-lg overflow-y-auto bg-background p-5 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="automation-panel-title" className="text-lg font-semibold text-foreground">{t("title", { name: template.name })}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tc("close")} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
          <div>
            <p id="automation-switch-label" className="text-sm font-medium text-foreground">{t("switchLabel")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{enabled ? t("switchOnHelp") : t("switchOffHelp")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="automation-switch-label"
            onClick={() => setEnabled((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"}`}
          >
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${enabled ? "start-[1.375rem]" : "start-0.5"}`} />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-foreground">{t("approvalTitle")}</legend>
          {(["ask", "auto"] as const).map((m) => (
            <label key={m} className={`mt-2 flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${mode === m ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-border"}`}>
              <input type="radio" name="approval-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 size-4 shrink-0" />
              <span>
                <span className="block text-sm font-medium text-foreground">{m === "ask" ? t("approvalAsk") : t("approvalAuto")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{m === "ask" ? t("approvalAskHelp") : t("approvalAutoHelp")}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {template.steps && template.steps.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-foreground">{t("steps")}</h3>
            <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
              {template.steps.map((s) => <li key={s.key}>{s.title}</li>)}
            </ol>
          </div>
        )}

        <div className="mt-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">{t("settingsTitle")}</h3>
          {fields.length === 0 ? <p className="text-sm text-muted-foreground">{t("noSettings")}</p> : (
            <ConfigForm fields={fields} values={values} disabled={busy} onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))} />
          )}
        </div>

        {details.length > 0 && (
          <div role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-medium">{t("checkSettings")}</p>
            <ul className="mt-1 list-disc space-y-0.5 ps-5">{details.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
        )}
        {message && (
          <p role={message.tone === "error" ? "alert" : "status"} className={`mt-4 text-sm ${message.tone === "error" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>
            {message.text}
          </p>
        )}

        {confirming && (
          <div role="alertdialog" aria-labelledby="automation-confirm-title" className="mt-4 rounded-2xl border border-amber-400 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
            <p id="automation-confirm-title" className="text-sm font-semibold text-amber-950 dark:text-amber-100">{t("confirmTitle")}</p>
            <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">{t("confirmBody")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => { setConfirming(false); void save(); }}>{t("confirmYes")}</button>
              <button type="button" className="inline-flex h-10 items-center rounded-full border-[1.5px] border-border px-4 text-sm font-medium hover:bg-muted" onClick={() => { setConfirming(false); setMode("ask"); }}>{t("confirmNo")}</button>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button type="button" className="btn-primary" disabled={busy || confirming} onClick={onSaveClick}>{busy ? t("saving") : t("save")}</button>
          <button type="button" className="inline-flex h-10 items-center rounded-full border-[1.5px] border-border px-4 text-sm font-medium hover:bg-muted" onClick={onClose}>{tc("close")}</button>
        </div>

        {template.key === DOCUMENT_INTAKE && saved?.enabled && (
          <div className="mt-6"><DocumentUpload automation={template.key} /></div>
        )}
      </div>
    </div>
  );
}
