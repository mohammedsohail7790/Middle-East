"use client";

import type { DashboardPushEvent } from "./realtime";

export type DashboardNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  at: string;
  read: boolean;
};

const STORAGE_KEY = "calliq_dashboard_notifications";
const MAX_ITEMS = 40;

function loadStored(): DashboardNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DashboardNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStored(items: DashboardNotification[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export function formatPushNotification(event: DashboardPushEvent): Omit<DashboardNotification, "id" | "read"> {
  const meta = event.meta ?? {};
  const at = event.at || new Date().toISOString();

  switch (event.type) {
    case "call.started":
      return {
        type: event.type,
        title: "Call started",
        body: "A live call is in progress",
        href: "/dashboard/calls",
        at,
      };
    case "call.ended":
      return {
        type: event.type,
        title: "Call ended",
        body: "Call finished — review transcript and outcome",
        href: "/dashboard/calls",
        at,
      };
    case "call.updated":
      return {
        type: event.type,
        title: "Call updated",
        body: "Call details or recording updated",
        href: "/dashboard/calls",
        at,
      };
    case "lead.created":
      return {
        type: event.type,
        title: "New lead",
        body: "A lead was captured from a call",
        href: meta.leadId ? `/dashboard/leads?lead=${meta.leadId}` : "/dashboard/leads",
        at,
      };
    case "lead.updated":
      return {
        type: event.type,
        title: "Lead updated",
        body: "Lead status or details changed",
        href: meta.leadId ? `/dashboard/leads?lead=${meta.leadId}` : "/dashboard/leads",
        at,
      };
    case "calendar.updated":
      return {
        type: event.type,
        title: "Appointments",
        body: "Appointment booked or updated",
        href: "/dashboard/leads",
        at,
      };
    case "billing.updated":
      return {
        type: event.type,
        title: "Workspace",
        body: "Workspace status changed",
        href: "/dashboard",
        at,
      };
    case "knowledge.updated":
      return {
        type: event.type,
        title: "Business profile",
        body: meta.fileName
          ? `${meta.fileName} added to training`
          : "Business profile updated",
        href: "/dashboard/business-profile",
        at,
      };
    case "config.updated":
      return {
        type: event.type,
        title: "AI agent updated",
        body: "Voice or receptionist settings changed",
        href: "/dashboard/agent",
        at,
      };
    default:
      return {
        type: event.type || "update",
        title: "Workspace update",
        body: (event.changed || []).join(", ") || "Data refreshed",
        href: "/dashboard",
        at,
      };
  }
}

export function appendNotificationFromPush(event: DashboardPushEvent): DashboardNotification[] {
  const formatted = formatPushNotification(event);
  const item: DashboardNotification = {
    ...formatted,
    id: `${formatted.type}-${formatted.at}-${Math.random().toString(36).slice(2, 8)}`,
    read: false,
  };
  const next = [item, ...loadStored()].slice(0, MAX_ITEMS);
  saveStored(next);
  return next;
}

export function getStoredNotifications(): DashboardNotification[] {
  return loadStored();
}

export function markAllNotificationsRead(): DashboardNotification[] {
  const next = loadStored().map((n) => ({ ...n, read: true }));
  saveStored(next);
  return next;
}

export function markNotificationRead(id: string): DashboardNotification[] {
  const next = loadStored().map((n) => (n.id === id ? { ...n, read: true } : n));
  saveStored(next);
  return next;
}

export function unreadNotificationCount(items: DashboardNotification[]): number {
  return items.filter((n) => !n.read).length;
}
