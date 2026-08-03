type AuthRouter = { replace: (href: string) => void };

/** Navigate after auth without router.refresh() (avoids long hangs on Vercel). */
export function navigateAfterSignIn(
  router: AuthRouter,
  path: "/dashboard" | "/onboarding"
): void {
  router.replace(path);
  window.setTimeout(() => {
    const p = window.location.pathname;
    if (p === "/login" || p === "/signup") {
      window.location.assign(path);
    }
  }, 600);
}
