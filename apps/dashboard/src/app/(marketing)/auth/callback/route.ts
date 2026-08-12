import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveOriginFromRequestHeaders } from "@/lib/auth-redirect";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-env";

function safeNextPath(raw: string | null): string {
  const next = raw ?? "/onboarding";
  if (!next.startsWith("/") || next.startsWith("//")) return "/onboarding";
  return next;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = resolveOriginFromRequestHeaders(request.headers);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (!code && !(tokenHash && type)) {
    return NextResponse.redirect(`${origin}/login?error=auth_missing_confirmation`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  let sessionUser: { id: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null =
    null;
  let accessToken: string | undefined;

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }
    sessionUser = data.user;
    accessToken = data.session?.access_token;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }
    sessionUser = data.user;
    accessToken = data.session?.access_token;
  }

  const gatewayBase = (
    process.env.NEXT_PUBLIC_GATEWAY_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "https://gateway.hallaai.com"
  ).replace(/\/$/, "");

  let tenantId =
    (sessionUser?.user_metadata?.tenant_id as string | undefined) ||
    (sessionUser?.app_metadata?.tenant_id as string | undefined);

  if (sessionUser?.id && accessToken) {
    try {
      const syncRes = await fetch(`${gatewayBase}/api/v1/team/sync-auth`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (syncRes.ok) {
        const syncJson = (await syncRes.json()) as { data?: { tenantId?: string } };
        if (syncJson?.data?.tenantId) tenantId = String(syncJson.data.tenantId);
      }
    } catch {
      /* client will retry sync on dashboard mount */
    }
  }

  if (!tenantId && sessionUser?.id && accessToken) {
    try {
      const lookup = await fetch(
        `${gatewayBase}/api/v1/tenants/onboarding-status?owner_user_id=${encodeURIComponent(sessionUser.id)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }
      );
      if (lookup.ok) {
        const json = (await lookup.json()) as { data?: { id?: string } };
        if (json?.data?.id) tenantId = String(json.data.id);
      }
    } catch {
      /* client will resolve on onboarding/dashboard mount */
    }
  }

  let destination = next === "/onboarding" && tenantId ? "/dashboard" : next;
  if (type === "email_change") {
    destination = "/dashboard/settings?email=confirmed";
  } else if (type === "invite" || sessionUser?.user_metadata?.invited_to_call_iq) {
    destination = tenantId ? "/dashboard" : "/onboarding";
  }
  if (!tenantId && (destination === "/dashboard" || destination === "/")) {
    destination = "/onboarding";
  }
  if (tenantId && destination === "/onboarding") {
    destination = "/dashboard";
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
