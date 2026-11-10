import type { Metadata } from "next";

/** The hub (page id "consultancy") is the general Halla AI home page, so its search title, description and canonical address say what it is (the receptionist wording belongs to the receptionist pages). */
const CONSULTANCY_TITLE = "Halla AI | End-to-End AI Systems for Businesses";
const CONSULTANCY_DESCRIPTION =
  "We design, build and run connected AI systems for your operations, plus a 24/7 Arabic and English AI receptionist.";

const DEFAULT_TITLE = "Halla AI – Smart • Seamless • Always";
const DEFAULT_DESCRIPTION = "Halla AI answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically.";


/** Search title and description for the main receptionist and automation pages. The wording follows what each page says. */
const PAGE_META: Record<string, [string, string]> = {
  home: ["AI Receptionist for Businesses | Halla AI", "Answers every call and WhatsApp message in Arabic and English, books appointments and routes urgent cases. Live in 15 minutes, from $39 a month."],
  features: ["AI Receptionist Features | Halla AI", "24/7 call answering, appointment booking, message taking, lead capture, call routing and spam blocking in seven languages, on every plan."],
  pricing: ["AI Receptionist Pricing | Halla AI", "Essential, Professional and Enterprise plans from $39 a month. 14-day free trial, no credit card, and annual billing saves 20%."],
  "how-it-works": ["How the AI Receptionist Works | Halla AI", "Set up in under 15 minutes: choose a plan, configure your agent, connect your calendar and CRM, forward your number and go live."],
  integrations: ["AI Receptionist Integrations | Halla AI", "Connect to Google Calendar, Calendly, HubSpot, Salesforce and more than 5,000 other apps through Zapier."],
  intelligence: ["AI Business Automation | Halla AI", "Automation built around one job in your business, connected to the tools you already use. About 10 days and AED 5,000 per automation, fixed."],
  "industries-all": ["AI Receptionist by Industry | Halla AI", "Pre-configured for clinics, real estate, legal, facilities, hotels, automotive, schools and insurance, answering in Arabic or English."],
  faq: ["Frequently Asked Questions | Halla AI", "Answers about how the Halla AI receptionist works, live agents, call recording, pricing and the free trial."],
  contact: ["Contact Halla AI", "Send the Halla AI team a message or email hello@hallaai.com. We reply within one business day. Live chat 9am to 5pm UAE time."],
  "svc-operations": ["Operations Automation | Halla AI Consultancy", "An AI engineer maps how a job runs today, builds the automation around it and connects it to your tools. About 10 days and AED 5,000 per automation, fixed."],
  "consult-signup": ["Book a Diagnostic Call | Halla AI Consultancy", "A no-pressure call about what to build first: a receptionist, an automation or a full roadmap. No obligation."],
  solutions: ["AI Receptionist Solutions | Halla AI", "Answering service, appointment scheduling, message taking, call routing, multilingual answering, after-hours handling, call screening and lead capture."],
  "solutions-answering": ["24/7 AI Answering Service | Halla AI", "An AI receptionist that answers every call day and night in Arabic and English, with no hold music and no voicemail."],
  "solutions-scheduling": ["AI Appointment Scheduling | Halla AI", "Books, reschedules and cancels appointments in your calendar while the caller is on the line."],
  "solutions-messages": ["AI Message Taking and Voicemail Transcription | Halla AI", "Takes detailed messages, transcribes them and sends them to your team by email."],
  "solutions-routing": ["AI Call Routing and Forwarding | Halla AI", "Routes calls by intent, time of day and urgency so an emergency reaches your team at once."],
  "solutions-multilingual": ["Multilingual AI Answering | Halla AI", "Detects the caller's language and switches between Arabic, English and five more languages without a transfer."],
  "solutions-afterhours": ["After-Hours Call Handling | Halla AI", "Keeps answering when your office is closed: takes messages, books appointments and escalates urgent cases."],
  "solutions-screening": ["Call Screening and Spam Blocking | Halla AI", "Detects spam calls and drops them in seconds. Spam calls are never charged."],
  "solutions-leads": ["AI Lead Capture and Qualification | Halla AI", "Asks your qualifying questions, scores each caller and sends the lead to your CRM."],
  blog: ["Halla AI Blog", "Guides on AI receptionists, call handling, pricing and compliance for businesses."],
  "blog-emergency": ["How to Handle Emergency Calls with an AI Receptionist | Halla AI", "How to set up emergency routing so urgent calls reach your on-call team within minutes."],
  "blog-ai-disclosure": ["AI Disclosure and Call Recording: What to Tell Callers | Halla AI", "What to say to callers about AI and call recording, and how to stay transparent."],
  "blog-crm-integrations": ["CRM Integrations for an AI Receptionist | Halla AI", "Seven CRM integrations that send captured leads straight into your pipeline, directly or through Zapier."],
  "blog-per-minute": ["Per-Minute Pricing vs Per-Call Pricing | Halla AI", "A worked example of why per-minute pricing can be fairer than per-call pricing."],
  "industry-clinics": ["AI Receptionist for Clinics and Medical Practices | Halla AI", "Answers patient calls, books appointments and routes urgent cases in Arabic and English."],
  "industry-legal": ["AI Receptionist for Legal and Business-Setup Firms | Halla AI", "Answers new-client enquiries, qualifies them and books consultations in Arabic and English."],
  "industry-insurance": ["AI Receptionist for Insurance and Mortgage Brokers | Halla AI", "Captures enquiries, qualifies leads and books calls with advisers, day and night."],
  "industry-realtors": ["AI Receptionist for Real Estate | Halla AI", "Answers property enquiries, qualifies buyers and tenants and books viewings."],
  "industry-education": ["AI Receptionist for Schools, Nurseries and Training Institutes | Halla AI", "Answers admissions and parent calls and books visits in Arabic and English."],
  "industry-hospitality": ["AI Receptionist for Hotels and Restaurants | Halla AI", "Answers reservation and guest calls around the clock in Arabic and English."],
  "industry-automotive": ["AI Receptionist for Car Dealers, Rental and Service Centres | Halla AI", "Answers sales and service calls and books test drives and service slots."],
  "industry-hvac": ["AI Receptionist for Facilities and AC Maintenance | Halla AI", "Answers service requests, separates contract and one-off jobs and routes emergencies."],
  forwarding: ["Set Up Halla AI in Minutes | Halla AI", "Step-by-step instructions for forwarding your calls or porting your number to Halla AI."],
  "ai-vs-human": ["AI vs Human Receptionist | Halla AI", "A cost and coverage comparison of an AI receptionist and a human receptionist."],
  "vs-smith": ["Halla AI vs Smith.ai | Halla AI", "How Halla AI compares with Smith.ai on pricing, languages and coverage."],
  "vs-ruby": ["Halla AI vs Ruby | Halla AI", "How Halla AI compares with Ruby on pricing, languages and coverage."],
  roi: ["AI Receptionist ROI Calculator | Halla AI", "Estimate what missed calls cost your business and what an AI receptionist could return."],
  compliance: ["Compliance and Data Protection | Halla AI", "How Halla AI handles AI disclosure, call recording and personal data."],
  security: ["Security | Halla AI", "Practical safeguards for the AI receptionist, automation and consultancy services."],
  privacy: ["Privacy Policy | Halla AI", "How Halla AI collects, uses and protects personal data."],
  terms: ["Terms of Use | Halla AI", "The terms that cover all three Halla AI services."],
  about: ["About Halla AI", "Halla AI is built by business owners, for business owners: AI systems and an AI receptionist for growing businesses."],
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
    const description = "A fixed-price audit and a roadmap you own, then builds from AED 8,000 at a fixed price and timeline. Custom software and AI automation for businesses.";
    return { title: { absolute: title }, description, alternates: { canonical: path.replace(/\/$/, "") || "/" }, openGraph: { title, description, type: "website", url: path } };
  }
  if (pageId === "fit-check") {
    const title = "Is Halla AI a fit for your business? | Halla AI Consultancy";
    const description = "Answer a few quick questions about your company and we will reply by email. No account, no password, no obligation.";
    return { title: { absolute: title }, description, alternates: { canonical: path.replace(/\/$/, "") || "/" } };
  }
  if (pageId === "audit-info") {
    const title = "Opportunity Audit: what to automate first | Halla AI Consultancy";
    const description = "A fixed-price audit (AED 5,000, about one week) that gives you a prioritised roadmap with a payoff estimate and a fixed build price for every opportunity.";
    return { title: { absolute: title }, description, alternates: { canonical: path.replace(/\/$/, "") || "/" }, openGraph: { title, description, type: "website", url: path } };
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
