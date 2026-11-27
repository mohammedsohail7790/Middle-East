"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FlaskConical } from "lucide-react";
import { api } from "@/lib/api";

type Access = { allowed: boolean; googleConnected: boolean };
type Added = { id: string; scheduled_time: string; googleConnected: boolean };

/**
 * Owner-only "Add test appointment". The server decides who may use it (GET /appointments/test-access); everyone else
 * sees nothing. It books a labelled test appointment the same way the AI receptionist does, so it also reaches the
 * connected Google Calendar. Used to see (and to show Google) a booking arrive without making a phone call.
 */
export function TestAppointmentTool({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations("pages.calendar");
  const locale = useLocale();
  const [access, setAccess] = useState<Access | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Access>("/appointments/test-access", { fresh: true })
      .then((a) => {
        if (!cancelled) setAccess(a);
      })
      .catch(() => {
        if (!cancelled) setAccess(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!access?.allowed) return null;

  const add = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const added = await api.post<Added>("/appointments/test", {});
      const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(added.scheduled_time));
      setMessage({
        ok: true,
        text: `${t("testToolAdded", { when })} ${added.googleConnected ? t("testToolSentGoogle") : t("testToolNoGoogle")}`,
      });
      onAdded();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error && e.message ? e.message : t("testToolFailed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dashboard-alert border-accent/30 bg-accent/5 mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-accent shrink-0" />
          {t("testToolTitle")}
        </p>
        <p className="text-xs text-foreground-secondary mt-1">{t("testToolHint")}</p>
        {message && (
          <p className={message.ok ? "text-xs text-emerald-700 mt-2" : "text-xs text-red-700 mt-2"} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        )}
      </div>
      <button type="button" onClick={() => void add()} disabled={busy} className="btn-primary text-sm shrink-0 tap-target">
        {busy ? t("testToolBusy") : t("testToolButton")}
      </button>
    </div>
  );
}
