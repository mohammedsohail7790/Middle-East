import { supabase } from "@/lib/supabase";
import { getTenantId } from "@/lib/store";
import { attachCsrfToHeaders, getGatewayBaseUrl } from "@/lib/api";
import { AutomationsApiError } from "./errors";
import type {
  AutomationApproval, AutomationRun, AutomationStats, LibraryTemplate, SavePayload, TenantAutomation,
} from "./types";

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const user = session?.user;
  const tenantId = (user?.user_metadata?.tenant_id as string | undefined) || (user?.app_metadata?.tenant_id as string | undefined) || getTenantId();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  if (tenantId) headers["x-tenant-id"] = tenantId;
  return headers;
}

async function call<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers = await authHeaders();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") await attachCsrfToHeaders(headers);
  let res: Response;
  try {
    res = await fetch(`${getGatewayBaseUrl()}/api/v1/automations${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new AutomationsApiError("network", 0);
  }
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string; message?: string; details?: unknown };
  if (!res.ok) {
    const details = Array.isArray(json.details) ? json.details.filter((d): d is string => typeof d === "string") : [];
    throw new AutomationsApiError(json.error || json.message || `API ${res.status}`, res.status, details);
  }
  return (json.data ?? json) as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return q.length ? `?${q.join("&")}` : "";
}

export const automationsApi = {
  library: async (): Promise<LibraryTemplate[]> => (await call<{ templates: LibraryTemplate[] }>("GET", "")).templates ?? [],
  save: (templateKey: string, payload: SavePayload) => call<TenantAutomation>("PUT", `/${encodeURIComponent(templateKey)}`, payload),
  runs: (p: { status?: string; automation?: string; limit?: number; offset?: number } = {}) => call<AutomationRun[]>("GET", `/runs${qs(p)}`),
  run: (id: string) => call<AutomationRun>("GET", `/runs/${encodeURIComponent(id)}`),
  retry: (id: string) => call<AutomationRun>("POST", `/runs/${encodeURIComponent(id)}/retry`, {}),
  approvals: (status = "pending") => call<AutomationApproval[]>("GET", `/approvals${qs({ status })}`),
  decide: (id: string, decision: "approve" | "reject") => call<unknown>("POST", `/approvals/${encodeURIComponent(id)}/decide`, { decision }),
  stats: (days: number) => call<AutomationStats>("GET", `/stats${qs({ days })}`),
  uploadDocument: (file: File, automation = "document-intake") => {
    const form = new FormData();
    form.append("file", file);
    form.append("automation", automation);
    return call<{ ref: string }>("POST", "/documents", undefined, form);
  },
};

/** Tells the sidebar badge that the list of waiting approvals changed. */
export const APPROVALS_CHANGED_EVENT = "halla-automation-approvals-changed";
export function notifyApprovalsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(APPROVALS_CHANGED_EVENT));
}

export { AutomationsApiError, errorStatus } from "./errors";
