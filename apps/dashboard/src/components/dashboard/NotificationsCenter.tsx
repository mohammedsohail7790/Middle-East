"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Bell } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import type { DashboardNotification } from "@/lib/dashboard-notifications";
import { useDashboardNotifications } from "./DashboardRealtimeProvider";

export function NotificationsCenter() {
  const { notifications, unreadCount, markAllRead, markRead } = useDashboardNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const handleMarkAllRead = useCallback(() => {
    markAllRead();
    setOpen(false);
  }, [markAllRead]);

  const onItemClick = (item: DashboardNotification) => {
    markRead(item.id);
    setOpen(false);
  };

  const list = notifications;
  const count = unreadCount;

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
          <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--paper)]">
            <Link href="/dashboard/calls" className="text-xs text-accent hover:underline" onClick={() => setOpen(false)}>
              View all calls
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
