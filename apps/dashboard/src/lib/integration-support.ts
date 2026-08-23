import { getPlan, normalizePlanId } from "@/lib/store";

/** Default support inbox — override with NEXT_PUBLIC_SUPPORT_EMAIL in production. */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "info@hallaai.com";

/** In-app help pages (same site as dashboard — no separate docs subdomain). */
export const HELP_SETUP_HREF = "/how-it-works";
export const HELP_FAQ_HREF = "/faq";

/** Paying subscribers (not trial) — eligible for free integration setup call. */
export function isPayingCustomer(): boolean {
  const plan = normalizePlanId(getPlan());
  return (
    plan === "starter" ||
    plan === "essential" ||
    plan === "professional"
  );
}

export function getIntegrationOnboardingCallUrl(integrationName?: string): string {
  const bookingUrl = process.env.NEXT_PUBLIC_INTEGRATION_ONBOARDING_CALL_URL?.trim();
  if (bookingUrl) return bookingUrl;

  const email = SUPPORT_EMAIL;
  const subject = integrationName
    ? `Free integration setup call — ${integrationName}`
    : "Free integration setup call";
  const body =
    "Hi Halla AI team,\n\nI'd like to book a free setup call to connect my integration.\n\nThanks!";
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
