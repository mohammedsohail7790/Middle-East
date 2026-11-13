"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { automationsApi, notifyApprovalsChanged } from "./client";
import { AutomationsApiError } from "./errors";
import { minutesLeft, proposalRows } from "./format";
import type { AutomationApproval } from "./types";

export function ApprovalsTab({ approvals, onRefresh }: { approvals: AutomationApproval[]; onRefresh: () => Promise<void> | void }) {
  const t = useTranslations("pages.automations.approvals");
  const tc = useTranslations("pages.automations.common");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { tone: "ok" | "info" | "error"; text: string }>>({});

  function timeText(a: AutomationApproval): string {
    const mins = minutesLeft(a.expiresAt);
    if (mins <= 0) return t("expired");
    const time = mins >= 60 ? tc("durationHm", { hours: Math.floor(mins / 60), minutes: mins % 60 }) : tc("minutesShort", { count: mins });
    return t("timeLeft", { time });
  }

  async function decide(a: AutomationApproval, decision: "approve" | "reject") {
    setBusyId(a.id);
    try {
      await automationsApi.decide(a.id, decision);
      setNotes((n) => ({ ...n, [a.id]: { tone: "ok", text: decision === "approve" ? t("approved") : t("rejected") } }));
      notifyApprovalsChanged();
      await onRefresh();
    } catch (err) {
      const status = err instanceof AutomationsApiError ? err.status : 0;
      let note: { tone: "info" | "error"; text: string };
      if (status === 403) note = { tone: "error", text: tc("noPermission") };
      else if (status === 404) note = { tone: "info", text: t("notFound") };
      else if (status === 409) {
        const expired = err instanceof AutomationsApiError && /expired/i.test(err.message);
        note = { tone: "info", text: expired ? t("expiredNotice") : t("alreadyAnswered") };
      } else note = { tone: "error", text: t("failed") };
      setNotes((n) => ({ ...n, [a.id]: note }));
      if (status === 404 || status === 409) {
        notifyApprovalsChanged();
        await onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  const answered = Object.entries(notes).filter(([id]) => !approvals.some((a) => a.id === id));

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="space-y-2">
        {answered.map(([id, n]) => <p key={id} role="status" className={`rounded-xl border p-3 text-sm ${n.tone === "ok" ? "border-emerald-300 text-emerald-800 dark:text-emerald-300" : "border-border text-foreground"}`}>{n.text}</p>)}
      </div>
      {approvals.length === 0 && answered.length === 0 && <EmptyState icon={ShieldCheck} title={t("emptyTitle")} description={t("emptyDescription")} />}
      {approvals.map((a) => {
        const rows = proposalRows(a.proposal);
        const note = notes[a.id];
        return (
          <article key={a.id} className="card rounded-[var(--radius-lg)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-foreground">{a.summary}</h3>
              <span className="text-xs text-muted-foreground">{timeText(a)}</span>
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("proposal")}</p>
            {rows.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">{t("noProposal")}</p> : (
              <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                {rows.map((r, i) => (
                  <div key={`${r.label}-${i}`} className="contents">
                    <dt className="text-muted-foreground">{r.label}</dt>
                    <dd className="whitespace-pre-wrap break-words text-foreground">{r.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {note && <p role={note.tone === "error" ? "alert" : "status"} className={`mt-3 text-sm ${note.tone === "error" ? "text-red-700 dark:text-red-300" : "text-foreground"}`}>{note.text}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={busyId !== null} onClick={() => void decide(a, "approve")}>{busyId === a.id ? t("working") : t("approve")}</button>
              <button type="button" className="inline-flex h-10 items-center rounded-full border-[1.5px] border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={busyId !== null} onClick={() => void decide(a, "reject")}>{t("reject")}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
