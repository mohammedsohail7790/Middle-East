import { supabase } from "@/lib/supabase";
import { getGatewayBaseUrl } from "@/lib/api";

export async function gatewayFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  const base = getGatewayBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch {
    return null;
  }

  if (!res.ok) {
    if (process.env.NODE_ENV === "development") {
      const body = await res.json().catch(() => ({}));
      console.warn("[gatewayFetch]", path, res.status, body);
    }
    return null;
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

/** Enterprise fetch with error message for UI surfaces */
export async function gatewayFetchWithError<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ data: T | null; error: string | null }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { data: null, error: "Not signed in" };
  }

  const base = getGatewayBaseUrl();
  try {
    const res = await fetch(`${base}/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        (typeof body.error === "string" ? body.error : null) ||
        (typeof body.message === "string" ? body.message : null) ||
        `API ${res.status}`;
      if (res.status === 403 && msg.toLowerCase().includes("tenant")) {
        return {
          data: null,
          error: "Workspace not linked — complete onboarding or sign out and back in",
        };
      }
      if (res.status === 500 && base.includes("localhost")) {
        return {
          data: null,
          error: "API unavailable — start the gateway: npm run dev:gateway",
        };
      }
      return { data: null, error: msg };
    }
    const json = await res.json();
    return { data: (json.data ?? json) as T, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    if (msg.includes("fetch") || msg === "Failed to fetch") {
      return {
        data: null,
        error: "Cannot reach API — run npm run dev:gateway (port 3003)",
      };
    }
    return { data: null, error: msg };
  }
}
