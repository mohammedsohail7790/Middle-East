import type { Metadata } from "next";

/** The consultancy is the home page, so its search title, description and canonical address say what it is (the receptionist wording belongs to the receptionist pages). */
const CONSULTANCY_TITLE = "Halla AI | AI Consultancy & AI Receptionist for the GCC";
const CONSULTANCY_DESCRIPTION =
  "We don’t sell AI — we install it. Halla AI builds connected AI systems for operations, client acquisition and brand visibility for businesses in the UAE, Saudi Arabia and the wider GCC, plus a 24/7 Arabic and English AI receptionist.";

const DEFAULT_TITLE = "Halla AI – Smart • Seamless • Always";
const DEFAULT_DESCRIPTION = "Halla AI answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically.";

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
  return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
}
