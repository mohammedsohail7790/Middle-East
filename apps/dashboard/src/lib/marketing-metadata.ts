import type { Metadata } from "next";

/** The consultancy is the home page, so its search title, description and canonical address say what it is (the receptionist wording belongs to the receptionist pages). */
const CONSULTANCY_TITLE = "Halla AI | AI Consultancy & AI Receptionist for the GCC";
const CONSULTANCY_DESCRIPTION =
  "We don’t sell AI — we install it. Halla AI builds connected AI systems for operations, client acquisition and brand visibility for businesses in the UAE, Saudi Arabia and the wider GCC, plus a 24/7 Arabic and English AI receptionist.";

const DEFAULT_TITLE = "Halla AI – Smart • Seamless • Always";
const DEFAULT_DESCRIPTION = "Halla AI answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically.";


/** Search title and description for the main receptionist and automation pages. The wording follows what each page says. */
const PAGE_META: Record<string, [string, string]> = {
  home: ["AI Receptionist for the GCC | Halla AI", "Halla AI answers every call and WhatsApp message in Arabic and English, books appointments and sends urgent cases to your team. Live in 15 minutes. Plans from $39 a month, with a 14-day free trial."],
  features: ["AI Receptionist Features | Halla AI", "24/7 call answering, appointment booking, message taking, lead capture, call routing and spam blocking in seven languages, on every plan."],
  pricing: ["AI Receptionist Pricing | Halla AI", "Essential, Professional and Enterprise plans from $39 a month. 14-day free trial, no credit card, and annual billing saves 20%."],
  "how-it-works": ["How the AI Receptionist Works | Halla AI", "Set up in under 15 minutes: choose a plan, configure your agent, connect your calendar and CRM, forward your number and go live."],
  integrations: ["AI Receptionist Integrations | Halla AI", "Connect to Google Calendar, Calendly, HubSpot, Salesforce and more than 5,000 other apps through Zapier."],
  intelligence: ["AI Business Automation | Halla AI", "One AI layer for your leads, quotes and invoices. It proposes the next action, waits for your approval on anything that matters and logs everything it does."],
  "industries-all": ["AI Receptionist by Industry | Halla AI", "Pre-configured for clinics, real estate, legal and business setup, facilities, hotels and restaurants, automotive, schools and insurance, answering in Arabic or English."],
  faq: ["Frequently Asked Questions | Halla AI", "Answers about how the Halla AI receptionist works, live agents, call recording, pricing and the free trial."],
  about: ["About Halla AI", "Halla AI is built by business owners, for business owners: AI systems and an AI receptionist for the GCC."],
};

/** Metadata for a marketing route. `path` is the public path (for example "/en"); `pageId` is what resolveMarketingPage chose for it. */
export function marketingMetadata(pageId: string, path: string): Metadata {
  if (pageId === "consultancy") {
    return {
      title: { absolute: CONSULTANCY_TITLE },
      description: CONSULTANCY_DESCRIPTION,
      alternates: { canonical: path === "/" ? "/" : path.replace(/\/$/, "") },
      openGraph: { title: CONSULTANCY_TITLE, description: CONSULTANCY_DESCRIPTION, type: "website", url: path, images: [{ url: "/logo-consultancy.jpg" }] },
      twitter: { card: "summary_large_image", title: CONSULTANCY_TITLE, description: CONSULTANCY_DESCRIPTION, images: ["/logo-consultancy.jpg"] },
    };
  }
  if (pageId === "ai-consultancy") {
    const title = "AI Consultancy for Small and Mid-Sized Businesses | Halla AI";
    const description = "A fixed-price Opportunity Audit and a prioritised roadmap you own, then builds from AED 8,000 with a fixed price and timeline. Custom software and AI automation for owner-led businesses in the GCC.";
    return { title: { absolute: title }, description, alternates: { canonical: path.replace(/\/$/, "") || "/" }, openGraph: { title, description, type: "website", url: path } };
  }
  if (pageId === "fit-check") {
    const title = "Is Halla AI a fit for your business? | Halla AI Consultancy";
    const description = "Answer a few quick questions about your company and we will reply by email. No account, no password, no obligation.";
    return { title: { absolute: title }, description, alternates: { canonical: path.replace(/\/$/, "") || "/" } };
  }
  if (pageId === "audit" || pageId === "audit-pay" || pageId === "audit-paid") {
    // Private pages that open from an emailed link: never in search results.
    return { title: { absolute: "Opportunity Audit | Halla AI Consultancy" }, robots: { index: false, follow: false } };
  }
  const meta = PAGE_META[pageId];
  if (meta) {
    const [title, description] = meta;
    return { title: { absolute: title }, description, alternates: { canonical: path.replace(/\/$/, "") || "/" }, openGraph: { title, description, type: "website", url: path } };
  }
  return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
}

/** The search/tab title for a page, when one is set for it. */
export function pageTitle(pageId: string): string | null {
  const t = marketingMetadata(pageId, "/").title;
  if (t && typeof t === "object" && "absolute" in t && typeof t.absolute === "string") return t.absolute;
  return null;
}
