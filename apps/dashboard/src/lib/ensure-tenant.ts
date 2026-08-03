import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { clearTenantId, getTenantId, setTenantId } from "@/lib/store";

type EnsureTenantOptions = {
  /** Max time to wait on gateway lookups during sign-in (ms). */
  maxWaitMs?: number;
};

export type OnboardingProgressSnapshot = {
  completed?: boolean;
  twilioProvisioned?: boolean;
  step?: string;
  crmConnected?: boolean;
  calendarConnected?: boolean;
  skippedSteps?: string[];
};

export type OnboardingEntryState = {
  tenantId: string | null;
  resumeStep: number | null;
  redirectToDashboard: boolean;
};

function readTenantFromUser(user: Session["user"] | null | undefined): string | null {
  if (!user) return null;
  const id =
    (user.user_metadata?.tenant_id as string | undefined) ||
    (user.app_metadata?.tenant_id as string | undefined);
  return id?.trim() || null;
}

/** Instant tenant resolution from session + local cache (no network). */
export function tenantIdFromSession(session: Session | null | undefined): string | null {
  const fromUser = readTenantFromUser(session?.user);
  if (fromUser) return fromUser;
  return getTenantId();
}

async function syncTenantToUserMetadata(
  tenantId: string,
  options?: { refreshSession?: boolean }
): Promise<void> {
  setTenantId(tenantId);
  try {
    await supabase.auth.updateUser({ data: { tenant_id: tenantId } });
    if (options?.refreshSession !== false) {
      void supabase.auth.refreshSession();
    }
  } catch {
    /* metadata sync is best-effort */
  }
}

/** First gateway hit wins — avoids waiting on slowest of three cold-start requests. */
async function resolveTenantFromGateway(userId: string): Promise<string | null> {
  const claim = async (id: string | undefined | null): Promise<string> => {
    const tid = id?.trim();
    if (!tid) throw new Error("miss");
    await syncTenantToUserMetadata(tid, { refreshSession: false });
    return tid;
  };

  const racers: Promise<string>[] = [
    api.get<{ id: string }>("/tenants/me").then((m) => claim(m?.id)),
    api
      .get<{ id: string }>(
        `/tenants/onboarding-status?owner_user_id=${encodeURIComponent(userId)}`
      )
      .then((m) => claim(m?.id)),
    api.post<{ tenantId?: string }>("/team/sync-auth", {}).then((r) => claim(r?.tenantId)),
  ];

  try {
    return await Promise.any(racers);
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

/** Align JWT metadata + localStorage with gateway-authoritative tenant. */
export async function ensureTenantSession(
  options?: EnsureTenantOptions
): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const maxWaitMs = options?.maxWaitMs ?? 12_000;

  const fromMeta = readTenantFromUser(user);
  if (fromMeta) {
    setTenantId(fromMeta);
    return fromMeta;
  }

  const cached = getTenantId();
  if (cached) {
    try {
      const verified = await withTimeout(resolveTenantFromGateway(user.id), maxWaitMs);
      if (verified) return verified;
    } catch {
      /* stale cache or cold gateway */
    }
    clearTenantId();
  }

  if (!user.id) return null;

  try {
    const resolved = await withTimeout(resolveTenantFromGateway(user.id), maxWaitMs);
    if (resolved) return resolved;
  } catch {
    /* gateway slow or cold — fall through */
  }

  return getTenantId();
}

/** Decide whether onboarding should resume, redirect, or start fresh. */
export async function resolveOnboardingEntry(
  options?: EnsureTenantOptions
): Promise<OnboardingEntryState> {
  const empty: OnboardingEntryState = {
    tenantId: null,
    resumeStep: null,
    redirectToDashboard: false,
  };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return empty;

  const tenantId = await ensureTenantSession({
    maxWaitMs: options?.maxWaitMs ?? 15_000,
  });
  if (!tenantId) return empty;

  try {
    const progress = await api.get<OnboardingProgressSnapshot>("/onboarding/progress");
    if (progress?.completed) {
      return { tenantId, resumeStep: null, redirectToDashboard: true };
    }
    const skippedIntegrations =
      progress?.skippedSteps?.includes("crm") || progress?.skippedSteps?.includes("integrations");
    if (progress?.crmConnected || progress?.calendarConnected || skippedIntegrations) {
      return { tenantId, resumeStep: 6, redirectToDashboard: false };
    }
    if (progress?.twilioProvisioned) {
      return { tenantId, resumeStep: 5, redirectToDashboard: false };
    }
    const resumeStep = progress?.step === "twilio" || progress?.step === "knowledge" ? 4 : 0;
    return { tenantId, resumeStep, redirectToDashboard: false };
  } catch {
    return { tenantId, resumeStep: 4, redirectToDashboard: false };
  }
}

/** Pick post-login route: dashboard when we know the workspace, else onboarding. */
export async function resolvePostAuthPath(
  session: Session,
  options?: EnsureTenantOptions
): Promise<"/dashboard" | "/onboarding"> {
  const quick = tenantIdFromSession(session);
  if (quick) {
    setTenantId(quick);
    return "/dashboard";
  }

  const tenantId = await ensureTenantSession({
    maxWaitMs: options?.maxWaitMs ?? 8_000,
  });
  if (tenantId) return "/dashboard";

  return "/onboarding";
}

export type WorkspaceProfile = {
  id: string;
  companyName?: string;
  email?: string;
};

export async function fetchWorkspaceProfile(): Promise<WorkspaceProfile | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  let tenantId =
    tenantIdFromSession(sessionData.session) ?? getTenantId();
  if (!tenantId) {
    tenantId = await ensureTenantSession({ maxWaitMs: 8_000 });
  }
  if (!tenantId) return null;

  const email = sessionData.session?.user?.email ?? undefined;

  try {
    const me = await api.get<{ id: string; company_name?: string; companyName?: string }>("/tenants/me");
    if (me?.id) {
      return {
        id: me.id,
        companyName: me.company_name ?? me.companyName,
        email,
      };
    }
  } catch {
    /* fall back to email only */
  }

  return { id: tenantId, email };
}
