import { buildAuthCallbackUrlFromOrigin, getClientAuthOrigin } from "./auth-redirect";

/** Where Supabase sends the browser after OAuth or email confirmation */
export function buildAuthCallbackUrl(nextPath = "/dashboard"): string {
  return buildAuthCallbackUrlFromOrigin(getClientAuthOrigin(), nextPath);
}

/** @deprecated Use buildAuthCallbackUrl */
export function buildOAuthCallbackUrl(nextPath = "/dashboard"): string {
  return buildAuthCallbackUrl(nextPath);
}
