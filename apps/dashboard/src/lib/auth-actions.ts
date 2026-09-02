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
  // Full page reload (not router.push) is intentional here — clears all
  // client-side React/Zustand state along with the Supabase session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
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
