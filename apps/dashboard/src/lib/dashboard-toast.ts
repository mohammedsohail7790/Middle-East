"use client";

export type DashboardToastType = "success" | "error" | "info" | "warning";

export type DashboardToast = {
  id: string;
  type: DashboardToastType;
  title: string;
  message?: string;
  durationMs: number;
};

type ToastInput = {
  type: DashboardToastType;
  title: string;
  message?: string;
  durationMs?: number;
  id?: string;
};

const listeners = new Set<(toast: DashboardToast) => void>();

function defaultDuration(type: DashboardToastType): number {
  if (type === "error") return 9000;
  if (type === "warning") return 7000;
  return 5500;
}

export function showDashboardToast(input: ToastInput): string {
  const toast: DashboardToast = {
    id: input.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    title: input.title,
    message: input.message,
    durationMs: input.durationMs ?? defaultDuration(input.type),
  };
  listeners.forEach((fn) => {
    try {
      fn(toast);
    } catch {
      /* listener error */
    }
  });
  return toast.id;
}

export function subscribeDashboardToasts(listener: (toast: DashboardToast) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
