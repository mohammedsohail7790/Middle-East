import { supabase } from "./supabase";
import { buildOAuthCallbackUrl } from "./oauth";
import { clearTenantId } from "./store";
import { clearAuthCache } from "./api";
import { clearDashboardHomeCache } from "./dashboard-cache";
import { clearDashboardBootstrap } from "./dashboard-bootstrap";

export async function signOutAndRedirect() {
  clearTenantId();
  clearAuthCache();
  clearDashboardHomeCache();
  clearDashboardBootstrap();
  await supabase.auth.signOut();
  window.location.href = "/login";
}

export async function signInWithOAuthProvider(
  provider: "google" | "github",
  nextPath: string
): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: buildOAuthCallbackUrl(nextPath),
    },
  });
  return error?.message ?? null;
}
