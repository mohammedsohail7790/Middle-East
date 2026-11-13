"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { automationsApi } from "./client";
import { AutomationsApiError } from "./errors";
import { checkUploadFile } from "./format";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string };

/** A drop box for the document-intake automation: the browser checks type and size first, the server checks again. */
export function DocumentUpload({ automation = "document-intake" }: { automation?: string }) {
  const t = useTranslations("pages.automations.upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  async function send(file: File | undefined) {
    if (!file) return;
    const problem = checkUploadFile(file);
    if (problem) {
      setState({ kind: "error", message: t(problem) });
      return;
    }
    setState({ kind: "sending" });
    try {
      await automationsApi.uploadDocument(file, automation);
      setState({ kind: "done" });
    } catch (err) {
      const fromServer = err instanceof AutomationsApiError && err.status > 0 && err.status < 500 ? err.message : "";
      setState({ kind: "error", message: fromServer || t("failed") });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section
      aria-label={t("title")}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void send(e.dataTransfer?.files?.[0]); }}
      className={`rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${dragging ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-border"}`}
    >
      <FileUp className="mx-auto size-6 text-muted-foreground" aria-hidden />
      <h3 className="mt-2 text-sm font-semibold text-foreground">{t("title")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{dragging ? t("drop") : t("hint")}</p>
      <input
        ref={inputRef}
        id="automation-document-file"
        data-testid="document-file-input"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain"
        className="sr-only"
        onChange={(e) => void send(e.target.files?.[0])}
      />
      <label
        htmlFor="automation-document-file"
        className="mt-3 inline-flex h-9 cursor-pointer items-center rounded-full border-[1.5px] border-border px-4 text-sm font-medium hover:bg-muted"
      >
        {state.kind === "sending" ? t("sending") : t("choose")}
      </label>
      <div aria-live="polite" className="mt-3 text-sm">
        {state.kind === "done" && (
          <p className="text-emerald-700 dark:text-emerald-300">
            {t("received")}{" "}
            <Link href="/dashboard/automations/activity" className="font-medium underline underline-offset-2">{t("seeResult")}</Link>
          </p>
        )}
        {state.kind === "error" && <p role="alert" className="text-red-700 dark:text-red-300">{state.message}</p>}
      </div>
    </section>
  );
}
