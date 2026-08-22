type AuthRouter = { replace: (href: string) => void };

/**
 * "/dashboard" and "/onboarding" only exist as [locale]-prefixed App Router
 * pages (app/[locale]/dashboard, app/[locale]/onboarding) — there's no
 * middleware that rewrites bare paths to the default locale, so navigating
 * to a bare path 404s. Always prefix with the active locale.
 */
function activeLocale(): string {
  try {
    return window.localStorage.getItem("halla_lang") || "en";
  } catch {
    return "en";
  }
}

function withLocale(path: "/dashboard" | "/onboarding"): string {
  return `/${activeLocale()}${path}`;
}

/** Prefix any dashboard sub-path (e.g. "/dashboard/phone-numbers?from=onboarding")
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
