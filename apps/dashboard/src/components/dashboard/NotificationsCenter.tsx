"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { SEVERITY_DOT, sortAlerts, toAlertView, type AlertView, type ServerAlert } from "@/lib/server-alerts";
import { cn, timeAgo } from "@/lib/utils";
import type { DashboardNotification } from "@/lib/dashboard-notifications";
import { useDashboardNotifications } from "./DashboardRealtimeProvider";

export function NotificationsCenter() {
  const { notifications, unreadCount, markAllRead, markRead } = useDashboardNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();

  // The business's saved alerts (minutes running out, a trial ending, a tool that stopped working). They come from the server, so they are still here after a refresh or on another device.
  const [alerts, setAlerts] = useState<ServerAlert[]>([]);
  const [alertsUnread, setAlertsUnread] = useState(0);
  const [emailAlerts, setEmailAlerts] = useState<boolean | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await api.get<{ alerts: ServerAlert[]; unread: number }>("/alerts", { fresh: true });
      setAlerts(Array.isArray(data?.alerts) ? data.alerts : []);
      setAlertsUnread(typeof data?.unread === "number" ? data.unread : 0);
    } catch {
      /* the bell still works without saved alerts */
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
    const timer = setInterval(() => void loadAlerts(), 60_000);
    const onFocus = () => void loadAlerts();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadAlerts]);

  useEffect(() => {
    if (!open) return;
    void loadAlerts();
    api
      .get<{ emailEnabled: boolean }>("/alerts/settings", { fresh: true })
      .then((s) => setEmailAlerts(!!s?.emailEnabled))
      .catch(() => setEmailAlerts(null));
  }, [open, loadAlerts]);

  const toggleEmailAlerts = async () => {
    const next = !(emailAlerts ?? true);
    setEmailAlerts(next);
    try {
      await api.put("/alerts/settings", { emailEnabled: next });
    } catch {
      setEmailAlerts(!next);
    }
  };

  const alertViews: AlertView[] = sortAlerts(alerts.map((a) => toAlertView(a, locale)));

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const handleMarkAllRead = useCallback(() => {
    markAllRead();
    setAlerts((prev) => prev.map((a) => ({ ...a, read_at: a.read_at ?? new Date().toISOString() })));
    setAlertsUnread(0);
    void api.post("/alerts/read-all", {}).catch(() => undefined);
    setOpen(false);
  }, [markAllRead]);

  const onAlertClick = (id: string, wasRead: boolean) => {
    if (!wasRead) {
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read_at: new Date().toISOString() } : a)));
      setAlertsUnread((n) => Math.max(0, n - 1));
      void api.post(`/alerts/${id}/read`, {}).catch(() => undefined);
    }
    setOpen(false);
  };

  const onItemClick = (item: DashboardNotification) => {
    markRead(item.id);
    setOpen(false);
  };

  const list = notifications;
  const count = unreadCount + alertsUnread;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="dashboard-icon-btn relative"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-[var(--accent)] text-[10px] font-semibold text-white flex items-center justify-center ring-2 ring-[var(--card)]">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg z-50 overflow-hidden"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            {count > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs text-accent hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {alertViews.length > 0 && (
            <div className="border-b border-[var(--border)]">
              <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-tertiary">Alerts</p>
              <ul className="max-h-56 overflow-y-auto" aria-label="Alerts">
                {alertViews.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      onClick={() => onAlertClick(a.id, a.read)}
                      className={cn(
                        "flex gap-2.5 px-3 py-3 border-t border-[var(--border)] first:border-t-0 hover:bg-[var(--nav-hover)] transition-colors",
                        !a.read && "bg-accent/[0.04]",
                      )}
                    >
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[a.severity], a.read && "opacity-40")} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{a.title}</span>
                        <span className="block text-xs text-foreground-secondary mt-0.5 line-clamp-3">{a.body}</span>
                        <span className="block text-[10px] text-foreground-tertiary mt-1">{timeAgo(a.at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {alertViews.length > 0 && list.length > 0 && (
            <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-tertiary">Activity</p>
          )}
          <ul className="max-h-80 overflow-y-auto">
            {list.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-foreground-secondary">
                Live updates appear here when calls, SMS, leads, or billing change.
              </li>
            ) : (
              list.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => onItemClick(item)}
                    className={cn(
                      "block px-3 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--nav-hover)] transition-colors",
                      !item.read && "bg-accent/[0.04]"
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-foreground-secondary mt-0.5 line-clamp-2">{item.body}</p>
                    <p className="text-[10px] text-foreground-tertiary mt-1">{timeAgo(item.at)}</p>
                  </Link>
                </li>
              ))
            )}
          </ul>
          <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--paper)] flex items-center justify-between gap-3">
            <Link href="/dashboard/calls" className="text-xs text-accent hover:underline" onClick={() => setOpen(false)}>
              View all calls
            </Link>
            {emailAlerts !== null && (
              <label className="flex items-center gap-1.5 text-xs text-foreground-secondary cursor-pointer">
                <input type="checkbox" checked={emailAlerts} onChange={() => void toggleEmailAlerts()} />
                Email me alerts
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
