"use client";



import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useRef,

  useState,

  type ReactNode,

} from "react";

import { subscribeDashboardMetrics, type LiveDashboardMetrics, type DashboardPushEvent } from "@/lib/realtime";

import {

  notifyDashboardSync,

  scopesFromMetricsDelta,

  scopesFromPushEvent,

  metricsSnapshotChanged,

  type DashboardSyncScope,

} from "@/lib/dashboard-sync";

import { setDashboardStreamConnected } from "@/lib/dashboard-stream-state";

import {

  appendNotificationFromPush,

  formatPushNotification,

  getStoredNotifications,

  markAllNotificationsRead,

  markNotificationRead,

  unreadNotificationCount,

  type DashboardNotification,

} from "@/lib/dashboard-notifications";

import { showDashboardToast } from "@/lib/dashboard-toast";



type Ctx = {

  live: LiveDashboardMetrics | null;

  connected: boolean;

  lastError: string | null;

};



type NotificationsCtx = {

  notifications: DashboardNotification[];

  unreadCount: number;

  markAllRead: () => void;

  markRead: (id: string) => void;

};



const DashboardLiveContext = createContext<Ctx>({

  live: null,

  connected: false,

  lastError: null,

});



const NotificationsContext = createContext<NotificationsCtx>({

  notifications: [],

  unreadCount: 0,

  markAllRead: () => {},

  markRead: () => {},

});



export function useDashboardLive() {

  return useContext(DashboardLiveContext);

}



export function useDashboardNotifications() {

  return useContext(NotificationsContext);

}



/**

 * Single SSE connection for the whole dashboard shell.

 * Pushes metric updates to context and notifies page scopes when data changes.

 */

export function DashboardRealtimeProvider({ children }: { children: ReactNode }) {

  const [live, setLive] = useState<LiveDashboardMetrics | null>(null);

  const [connected, setConnected] = useState(false);

  const [lastError, setLastError] = useState<string | null>(null);

  const prevMetrics = useRef<LiveDashboardMetrics | null>(null);

  const [notifications, setNotifications] = useState<DashboardNotification[]>(() =>

    typeof window !== "undefined" ? getStoredNotifications() : []

  );



  const onMetrics = useCallback((data: LiveDashboardMetrics) => {

    setConnected(true);

    setLastError(null);

    const prev = prevMetrics.current;

    const scopes = scopesFromMetricsDelta(prev, data);

    prevMetrics.current = data;

    setLive(data);

    if (scopes.length > 0 && metricsSnapshotChanged(prev, data)) {

      notifyDashboardSync(scopes);

    }

  }, []);



  const onPush = useCallback((event: DashboardPushEvent) => {

    setConnected(true);

    setLastError(null);

    setNotifications(appendNotificationFromPush(event));

    if (
      event.type === "integrations.updated" ||
      event.type.includes("error") ||
      event.type.includes("failed")
    ) {
      const formatted = formatPushNotification(event);
      showDashboardToast({
        type:
          event.type === "integrations.updated"
            ? "success"
            : event.type.includes("error") || event.type.includes("failed")
              ? "error"
              : "info",
        title: formatted.title,
        message: formatted.body,
        durationMs: 6000,
      });
    }

    const scopes = scopesFromPushEvent(event.changed);

    if (scopes.length > 0) {

      notifyDashboardSync(scopes, { immediate: true });

    }

  }, []);



  const onError = useCallback((err: Error) => {

    setConnected(false);

    setLastError(err.message);

  }, []);



  const markAllRead = useCallback(() => {

    setNotifications(markAllNotificationsRead());

  }, []);



  const markRead = useCallback((id: string) => {

    setNotifications(markNotificationRead(id));

  }, []);



  const onConnectionChange = useCallback((ok: boolean) => {
    setConnected(ok);
    setDashboardStreamConnected(ok);
    if (ok) setLastError(null);
  }, []);

  useEffect(() => {
    prevMetrics.current = null;
    let unsubscribe: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      unsubscribe = subscribeDashboardMetrics(
        onMetrics,
        onError,
        onPush,
        { onConnectionChange }
      );
    }, 2000);

    return () => {
      window.clearTimeout(timer);
      unsubscribe?.();
      setConnected(false);
      setDashboardStreamConnected(false);
    };
  }, [onMetrics, onError, onPush, onConnectionChange]);

  /** Light poll when SSE is down — metrics only (avoid refetching every page) */
  useEffect(() => {
    if (connected) return;
    const id = setInterval(() => {
      notifyDashboardSync(["metrics"]);
    }, 60000);
    return () => clearInterval(id);
  }, [connected]);



  const unreadCount = unreadNotificationCount(notifications);



  return (

    <DashboardLiveContext.Provider value={{ live, connected, lastError }}>

      <NotificationsContext.Provider

        value={{ notifications, unreadCount, markAllRead, markRead }}

      >

        {children}

      </NotificationsContext.Provider>

    </DashboardLiveContext.Provider>

  );

}



/** Manual refresh after a mutation (create lead, book appointment, send SMS, etc.) */

export function syncAfterMutation(scopes: DashboardSyncScope | DashboardSyncScope[]) {

  notifyDashboardSync(scopes);

}


