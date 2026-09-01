"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  subscribeDashboardToasts,
  type DashboardToast,
  type DashboardToastType,
} from "@/lib/dashboard-toast";

const ICONS: Record<DashboardToastType, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const STYLES: Record<DashboardToastType, string> = {
  success:
    "border-emerald-200/80 bg-emerald-50/95 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-100",
  error:
    "border-red-200/80 bg-red-50/95 text-red-950 dark:border-red-900 dark:bg-red-950/90 dark:text-red-100",
  info: "border-slate-200/80 bg-slate-50/95 text-slate-950 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-100",
  warning:
    "border-amber-200/80 bg-amber-50/95 text-amber-950 dark:border-amber-900 dark:bg-amber-950/90 dark:text-amber-100",
};

const ICON_STYLES: Record<DashboardToastType, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-red-600 dark:text-red-400",
  info: "text-slate-600 dark:text-slate-400",
  warning: "text-amber-600 dark:text-amber-400",
};

const MAX_VISIBLE = 4;

export function DashboardToastHost() {
  const [items, setItems] = useState<DashboardToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return subscribeDashboardToasts((toast) => {
      setItems((prev) => [toast, ...prev].slice(0, MAX_VISIBLE));
    });
  }, []);

  useEffect(() => {
    if (!items.length) return;
    const timers = items.map((t) =>
      window.setTimeout(() => dismiss(t.id), t.durationMs)
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [items, dismiss]);

  return (
    <div
      className="pointer-events-none fixed z-[200] inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-4 sm:bottom-auto sm:top-[4.5rem] flex flex-col gap-2 px-3 sm:px-0 sm:w-[min(100vw-2rem,24rem)]"
      aria-live="polite"
      aria-relevant="additions"
    >
      <AnimatePresence initial={false}>
        {items.map((toast) => {
          const Icon = ICONS[toast.type];
          return (
            <motion.div
              key={toast.id}
              role="alert"
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className={cn(
                "pointer-events-auto dashboard-panel-padded !p-3.5 shadow-lg border backdrop-blur-md",
                STYLES[toast.type]
              )}
            >
              <div className="flex gap-3">
                <Icon className={cn("size-5 shrink-0 mt-0.5", ICON_STYLES[toast.type])} strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{toast.title}</p>
                  {toast.message && (
                    <p className="text-xs mt-1 opacity-90 leading-relaxed break-words">{toast.message}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="shrink-0 rounded-md p-1 opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  aria-label="Dismiss notification"
                >
                  <X className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
