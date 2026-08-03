import { supabase } from "./supabase";

import { api, getGatewayBaseUrl, getGatewayWsBaseUrl } from "./api";

import { getTenantId } from "./store";



export interface LiveDashboardMetrics {

  timestamp: string;

  activeCalls: number;

  liveCalls: Array<{

    callSid?: string;

    callerPhone?: string;

    voice?: string;

    language?: string;

    durationSec?: number;

  }>;

  totalCalls: number;

  completedCalls: number;

  callsToday: number;

  totalLeads: number;

  leadsToday: number;

  /** Gateway may include which domains changed since last push */

  changed?: string[];

}



export interface DashboardPushEvent {

  push: true;

  type: string;

  changed: string[];

  at: string;

  meta?: Record<string, unknown>;

}



const SSE_TOKEN_CACHE_MS = 120_000; // 2 min (gateway TTL default 5 min; refresh before stale secrets after deploy)

let sseTokenCache: { query: string; expiresAt: number } | null = null;

let sseTokenInflight: Promise<string> | null = null;

/** Drop cached stream token (e.g. after 401 or gateway redeploy). */
export function clearSseTokenCache(): void {
  sseTokenCache = null;
  sseTokenInflight = null;
}

async function fetchSseAuthQuery(forceRefresh = false): Promise<string> {
  if (forceRefresh) clearSseTokenCache();

  const now = Date.now();

  if (sseTokenCache && sseTokenCache.expiresAt > now) {

    return sseTokenCache.query;

  }



  if (sseTokenInflight) return sseTokenInflight;



  sseTokenInflight = (async () => {

    try {

      const { data } = await supabase.auth.getSession();

      const accessToken = data.session?.access_token;

      if (!accessToken) return "";



      const apiBase = getGatewayBaseUrl();

      const res = await fetch(`${apiBase}/api/v1/dashboard/sse-token`, {

        headers: { Authorization: `Bearer ${accessToken}` },

      });



      if (res.status === 429) {

        const retrySec = Number(res.headers.get("Retry-After") || "30");

        throw Object.assign(new Error("SSE token rate limited"), {

          rateLimited: true,

          retryAfterMs: Math.max(5, retrySec) * 1000,

        });

      }



      if (!res.ok) return "";

      const json = (await res.json()) as { data?: { token?: string } };

      const token = json?.data?.token;

      const query = token ? `?token=${encodeURIComponent(token)}` : "";

      if (token) {

        sseTokenCache = { query, expiresAt: Date.now() + SSE_TOKEN_CACHE_MS };

      }

      return query;

    } finally {

      sseTokenInflight = null;

    }

  })();



  return sseTokenInflight;

}



export function subscribeDashboardMetrics(

  onMetrics: (metrics: LiveDashboardMetrics) => void,

  onError?: (err: Error) => void,

  onPush?: (event: DashboardPushEvent) => void,

  options?: { onConnectionChange?: (connected: boolean) => void }

): () => void {

  let es: EventSource | null = null;

  let cancelled = false;

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  let reconnectDelayMs = 2000;

  const maxReconnectDelayMs = 30000;

  let connecting = false;

  let disconnectDebounce: ReturnType<typeof setTimeout> | null = null;

  const setConnected = (connected: boolean) => {
    if (connected) {
      if (disconnectDebounce) {
        clearTimeout(disconnectDebounce);
        disconnectDebounce = null;
      }
      options?.onConnectionChange?.(true);
      return;
    }
    if (disconnectDebounce) return;
    disconnectDebounce = setTimeout(() => {
      disconnectDebounce = null;
      options?.onConnectionChange?.(false);
    }, 4000);
  };



  const scheduleReconnect = (overrideDelayMs?: number) => {

    if (cancelled || reconnectTimer) return;

    const delay = overrideDelayMs ?? reconnectDelayMs;

    reconnectTimer = setTimeout(() => {

      reconnectTimer = null;

      void connect();

    }, delay);

    if (!overrideDelayMs) {

      reconnectDelayMs = Math.min(Math.round(reconnectDelayMs * 1.5), maxReconnectDelayMs);

    }

  };



  let streamAuthRefresh = false;

  const connect = async () => {

    if (cancelled || connecting) return;

    connecting = true;



    try {

      const tenantId = getTenantId();

      if (!tenantId) {

        setConnected(false);

        return;

      }



      es?.close();

      const tokenQ = await fetchSseAuthQuery(streamAuthRefresh);

      streamAuthRefresh = false;

      if (!tokenQ) {

        setConnected(false);

        onError?.(new Error("Could not obtain dashboard stream token"));

        scheduleReconnect(15_000);

        return;

      }

      const url = `${getGatewayBaseUrl()}/api/v1/dashboard/stream${tokenQ}`;

      es = new EventSource(url);



      es.onopen = () => {

        reconnectDelayMs = 2000;

        setConnected(true);

      };



      es.onmessage = (event) => {

        try {

          const data = JSON.parse(event.data);

          if (data.connected) {

            setConnected(true);

            return;

          }

          if (data.push && Array.isArray(data.changed)) {

            setConnected(true);

            onPush?.(data as DashboardPushEvent);

            return;

          }

          if (data.error) {

            setConnected(false);

            onError?.(new Error(data.error));

            return;

          }

          setConnected(true);

          onMetrics(data as LiveDashboardMetrics);

        } catch (e) {

          onError?.(e instanceof Error ? e : new Error(String(e)));

        }

      };



      es.onerror = () => {

        setConnected(false);

        es?.close();

        es = null;

        if (!cancelled) {

          clearSseTokenCache();

          streamAuthRefresh = true;

          onError?.(new Error("Dashboard metrics stream disconnected"));

          scheduleReconnect();

        }

      };

    } catch (e) {

      const err = e as Error & { rateLimited?: boolean; retryAfterMs?: number };

      if (err.rateLimited) {

        onError?.(new Error("Dashboard stream temporarily rate limited"));

        scheduleReconnect(err.retryAfterMs ?? 30_000);

      } else {

        onError?.(err instanceof Error ? err : new Error(String(e)));

        scheduleReconnect();

      }

    } finally {

      connecting = false;

    }

  };



  void connect();



  const onTenantReady = () => {

    reconnectDelayMs = 2000;

    void connect();

  };

  if (typeof window !== "undefined") {

    window.addEventListener("calliq-tenant-ready", onTenantReady);

  }



  return () => {

    cancelled = true;

    if (typeof window !== "undefined") {

      window.removeEventListener("calliq-tenant-ready", onTenantReady);

    }

    if (reconnectTimer) clearTimeout(reconnectTimer);

    if (disconnectDebounce) clearTimeout(disconnectDebounce);

    es?.close();

    options?.onConnectionChange?.(false);

  };

}



type AiConfigListener = {

  onConfig: (config: unknown) => void;

  onError?: (err: Error) => void;

};



let aiConfigWs: WebSocket | null = null;

let aiConfigListeners = new Set<AiConfigListener>();

let aiConfigReconnectTimer: ReturnType<typeof setTimeout> | null = null;

let aiConfigClosed = false;

let aiConfigConnecting = false;

let aiConfigReconnectDelayMs = 3000;

const aiConfigMaxReconnectDelayMs = 60_000;



async function fetchAiConfigWsToken(): Promise<string | null> {

  try {

    const data = await api.get<{ token?: string }>("/ai-config/ws-token");

    return data?.token ?? null;

  } catch (e) {

    const err = e as Error & { status?: number; retryAfterSeconds?: number };

    if (err.status === 429) {

      throw Object.assign(new Error("WS token rate limited"), {

        rateLimited: true,

        retryAfterMs: (err.retryAfterSeconds ?? 30) * 1000,

      });

    }

    return null;

  }

}



function scheduleAiConfigReconnect(overrideDelayMs?: number) {

  if (aiConfigClosed || aiConfigReconnectTimer) return;

  const delay = overrideDelayMs ?? aiConfigReconnectDelayMs;

  aiConfigReconnectTimer = setTimeout(() => {

    aiConfigReconnectTimer = null;

    void ensureAiConfigWsConnected();

  }, delay);

  if (!overrideDelayMs) {

    aiConfigReconnectDelayMs = Math.min(

      Math.round(aiConfigReconnectDelayMs * 1.5),

      aiConfigMaxReconnectDelayMs

    );

  }

}



async function ensureAiConfigWsConnected() {

  if (aiConfigClosed || aiConfigConnecting || aiConfigListeners.size === 0) return;

  const tenantId = getTenantId();

  if (!tenantId) return;



  aiConfigConnecting = true;



  try {

    const token = await fetchAiConfigWsToken();

    const wsBase = getGatewayWsBaseUrl();

    const q = token ? `?token=${encodeURIComponent(token)}` : "";

    aiConfigWs?.close();

    aiConfigWs = new WebSocket(`${wsBase}/ws/ai-config/${tenantId}${q}`);



    aiConfigWs.onopen = () => {

      aiConfigReconnectDelayMs = 3000;

    };



    aiConfigWs.onmessage = (event) => {

      try {

        const msg = JSON.parse(event.data);

        if (msg.type === "config_updated" || msg.type === "config_state") {

          for (const listener of aiConfigListeners) {

            listener.onConfig(msg.config);

          }

        }

      } catch (e) {

        const err = e instanceof Error ? e : new Error(String(e));

        for (const listener of aiConfigListeners) {

          listener.onError?.(err);

        }

      }

    };



    aiConfigWs.onerror = () => {

      for (const listener of aiConfigListeners) {

        listener.onError?.(new Error("AI config WebSocket error"));

      }

    };



    aiConfigWs.onclose = () => {

      aiConfigWs = null;

      if (!aiConfigClosed && aiConfigListeners.size > 0) {

        scheduleAiConfigReconnect();

      }

    };

  } catch (e) {

    const err = e as Error & { rateLimited?: boolean; retryAfterMs?: number };

    if (err.rateLimited) {

      scheduleAiConfigReconnect(err.retryAfterMs ?? 30_000);

    } else {

      scheduleAiConfigReconnect();

    }

  } finally {

    aiConfigConnecting = false;

  }

}



function onAiConfigTenantReady() {

  aiConfigReconnectDelayMs = 3000;

  void ensureAiConfigWsConnected();

}



let aiConfigTenantListenerRegistered = false;



function registerAiConfigTenantListener() {

  if (aiConfigTenantListenerRegistered || typeof window === "undefined") return;

  aiConfigTenantListenerRegistered = true;

  window.addEventListener("calliq-tenant-ready", onAiConfigTenantReady);

}



export function subscribeAIConfigUpdates(

  onConfig: (config: unknown) => void,

  onError?: (err: Error) => void

): () => void {

  aiConfigClosed = false;

  registerAiConfigTenantListener();



  const listener: AiConfigListener = { onConfig, onError };

  aiConfigListeners.add(listener);

  void ensureAiConfigWsConnected();



  return () => {

    aiConfigListeners.delete(listener);

    if (aiConfigListeners.size === 0) {

      if (aiConfigReconnectTimer) {

        clearTimeout(aiConfigReconnectTimer);

        aiConfigReconnectTimer = null;

      }

      aiConfigWs?.close();

      aiConfigWs = null;

    }

  };

}

