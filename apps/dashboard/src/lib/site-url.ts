export const PRODUCTION_SITE_ORIGIN = "https://www.calliqlabs.com";
const PRODUCTION_SITE = PRODUCTION_SITE_ORIGIN;

/** Canonical public site URL (Vercel production or local dev). */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  let url = fromEnv
    ? fromEnv.replace(/\/$/, "")
    : typeof window !== "undefined"
      ? window.location.origin.replace(/\/$/, "")
      : PRODUCTION_SITE;

  if (process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/i.test(url)) {
    return PRODUCTION_SITE;
  }
  return url;
}
