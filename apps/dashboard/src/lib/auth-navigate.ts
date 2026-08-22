type AuthRouter = { replace: (href: string) => void };

/**
 * "/dashboard" only exists as a [locale]-prefixed App Router page
 * (app/[locale]/dashboard) — there's no middleware that rewrites bare paths
 * to the default locale, so navigating to a bare path 404s. Always prefix
 * it with the active locale. "/onboarding" lives at app/(marketing)/onboarding
 * (no locale segment) and must NOT be prefixed, or it 404s the same way.
 */
function activeLocale(): string {
  try {
    return window.localStorage.getItem("halla_lang") || "en";
  } catch {
    return "en";
  }
}

function withLocale(path: "/dashboard" | "/onboarding"): string {
  return path === "/dashboard" ? `/${activeLocale()}${path}` : path;
}

/** Prefix a dashboard sub-path (e.g. "/dashboard/phone-numbers?from=onboarding")
 *  with the active locale — same 404 concern as withLocale() above. */
export function localizedDashboardPath(pathWithQuery: string): string {
  return `/${activeLocale()}${pathWithQuery}`;
}

/** Navigate after auth without router.refresh() (avoids long hangs on Vercel). */
export function navigateAfterSignIn(
  router: AuthRouter,
  path: "/dashboard" | "/onboarding"
): void {
  const target = withLocale(path);
  router.replace(target);
  window.setTimeout(() => {
    const p = window.location.pathname;
    if (p === "/login" || p === "/signup") {
      window.location.assign(target);
    }
  }, 600);
}
