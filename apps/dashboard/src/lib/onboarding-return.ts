/**
 * Set in the browser just before the client signs in to a calendar or CRM from the setup wizard. The provider sends them to the
 * Integrations page; that page sees this flag and sends them back to setup instead of leaving them in an unfinished dashboard.
 */
export const ONBOARDING_RETURN_KEY = "halla.onboarding.returnAfterConnect";

/** True once, and clears the flag. Safe where storage is blocked. */
export function consumeOnboardingReturn(): boolean {
  try {
    if (window.sessionStorage.getItem(ONBOARDING_RETURN_KEY) !== "1") return false;
    window.sessionStorage.removeItem(ONBOARDING_RETURN_KEY);
    return true;
  } catch {
    return false;
  }
}
