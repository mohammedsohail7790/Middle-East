"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, Loader2, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api, asArray } from "@/lib/api";
import { normalizeTransferNumber } from "@/lib/onboarding-setup";
import { buildGoLiveChecklist, goLiveProgress, isGoLiveComplete, type GoLiveItem } from "@/lib/go-live-checklist";

const DISMISS_KEY = "halla.goLive.dismissed";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A "get ready to go live" card at the top of the dashboard home for a new client: claim a line, add questions and answers, test the line,
 * and optionally link a calendar and CRM. It reads what is really saved, hides itself once the required items are done, and can be hidden by hand.
 * If any of the lookups fails it stays hidden rather than telling the client something wrong.
 */
export function GoLiveChecklist() {
  const t = useTranslations("pages.home");
  const [items, setItems] = useState<GoLiveItem[] | null>(null);
  const [hidden, setHidden] = useState(true);
  const [number, setNumber] = useState("");
  const [calling, setCalling] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (wasDismissed()) return;
    let cancelled = false;
    (async () => {
      const [progress, line, catalog, knowledge] = await Promise.allSettled([
        api.get<{ testCallCompleted?: boolean }>("/onboarding/progress"),
        api.get<{ configured?: boolean }>("/onboarding/twilio-status"),
        api.get<{ connections?: Record<string, { status?: string }> }>("/integrations/catalog"),
        api.get<unknown>("/knowledge"),
      ]);
      if (cancelled) return;
      if ([progress, line, catalog, knowledge].some((r) => r.status === "rejected")) return;
      const get = <T,>(r: PromiseSettledResult<T>) => (r as PromiseFulfilledResult<T>).value;
      const list = buildGoLiveChecklist({
        phoneLine: get(line)?.configured === true,
        knowledgeCount: asArray(get(knowledge)).length,
        testCallDone: get(progress)?.testCallCompleted === true,
        connections: get(catalog)?.connections ?? {},
      });
      setItems(list);
      setHidden(isGoLiveComplete(list));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || hidden) return null;

  const { done, total } = goLiveProgress(items);
  const phoneDone = items.find((i) => i.id === "phone")?.done === true;
  const valid = normalizeTransferNumber(number);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* hidden for this visit only */
    }
    setHidden(true);
  }

  async function callMe() {
    if (!valid) return;
    setCalling(true);
    setNote(null);
    try {
      const res = await api.post<{ success?: boolean; message?: string }>("/onboarding/test-call", { phoneNumber: valid });
      if (res?.success === false) {
        setNote(res.message || t("goLiveCallFailed"));
        return;
      }
      setNote(t("goLiveCalling", { number: valid }));
      setItems((prev) => {
        if (!prev) return prev;
        const next = prev.map((i) => (i.id === "testCall" ? { ...i, done: true } : i));
        setHidden(isGoLiveComplete(next));
        return next;
      });
    } catch (e) {
      setNote(e instanceof Error ? e.message : t("goLiveCallFailed"));
    } finally {
      setCalling(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card" aria-label={t("goLiveTitle")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("goLiveTitle")}</h2>
          <p className="text-xs text-foreground-secondary">{t("goLiveProgress", { done, total })}</p>
        </div>
        <button type="button" onClick={dismiss} aria-label={t("goLiveDismiss")} className="text-foreground-secondary hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {i.done ? (
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" aria-label={t("goLiveDone")} />
            ) : (
              <Circle className="size-4 text-foreground-secondary shrink-0" />
            )}
            <span className={i.done ? "text-foreground-secondary line-through" : "text-foreground"}>{t(`goLiveItem_${i.id}`)}</span>
            {!i.required && !i.done && <span className="text-[11px] text-foreground-secondary">{t("goLiveOptional")}</span>}
            {!i.done && i.href && (
              <Link href={i.href} className="ms-auto text-xs font-medium text-accent hover:underline">
                {t("goLiveOpen")}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {!items.find((i) => i.id === "testCall")?.done && phoneDone && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="tel"
            inputMode="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="+971 50 123 4567"
            aria-label={t("goLiveNumber")}
            className="input flex-1 min-w-[12rem]"
          />
          <button type="button" onClick={() => void callMe()} disabled={!valid || calling} className="btn-ghost inline-flex items-center gap-2 disabled:opacity-50">
            {calling && <Loader2 className="size-4 animate-spin" />}
            {t("goLiveCallMe")}
          </button>
        </div>
      )}
      {note && <p className="mt-2 text-xs text-foreground-secondary">{note}</p>}
    </section>
  );
}
