/** Default support inbox — override with NEXT_PUBLIC_SUPPORT_EMAIL in production. */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "info@hallaai.com";

/** In-app help pages (same site as dashboard — no separate docs subdomain). */
export const HELP_SETUP_HREF = "/how-it-works";
export const HELP_FAQ_HREF = "/faq";
