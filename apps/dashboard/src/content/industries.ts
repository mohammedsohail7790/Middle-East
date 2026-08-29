import type { Faq } from "@/components/marketing/FaqAccordion";

export type IndustryFaq = Faq;

export type Industry = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  faqs: IndustryFaq[];
};

export const INDUSTRIES: Industry[] = [
  {
    slug: "hvac",
    name: "HVAC",
    tagline: "Keep Your Schedule Hot. Not Your Customers.",
    description:
      "Halla AI dispatches HVAC technicians 24/7 — handling no-heat emergencies in winter, no-AC calls in summer, and maintenance bookings all year round while you're in an attic or under a house.",
    faqs: [
      {
        question: "How does Halla AI handle seasonal demand spikes?",
        answer:
          "The AI scales automatically. During heat waves or cold snaps, it handles hundreds of simultaneous calls without busy signals. You define priority rules — AI follows them consistently.",
      },
      {
        question: "Can the AI diagnose basic HVAC problems?",
        answer:
          "Yes. It guides homeowners through basic troubleshooting (thermostat batteries, resetting breakers, changing filters). If not resolved, it escalates for dispatch.",
      },
      {
        question: "How does Halla AI handle carbon monoxide concerns?",
        answer:
          "CO-related calls are flagged as highest priority. The AI instructs the homeowner to evacuate and call the fire department, then immediately alerts your team.",
      },
    ],
  },
  {
    slug: "plumbing",
    name: "Plumbing",
    tagline: "Stop Leaks. Not Leads.",
    description:
      "Captures emergency details, books service windows, and sends job summaries instantly to your phone when you're knee-deep in a flooded basement — burst pipes, clogged drains, water heaters, and routine maintenance.",
    faqs: [
      {
        question: "How does Halla AI handle after-hours emergency calls?",
        answer:
          "You define what's an emergency. The AI collects details and immediately notifies your on-call plumber via text with the full job summary.",
      },
      {
        question: "Can the AI provide estimates over the phone?",
        answer:
          "Yes — service call fees, hourly rates, and common flat-rate pricing. For complex estimates, it collects details and schedules an on-site assessment.",
      },
      {
        question: "What if a customer has a gas line concern?",
        answer:
          "Gas-related calls are flagged as highest priority with immediate team notification and instructions to evacuate and call the gas company.",
      },
    ],
  },
  {
    slug: "electrical",
    name: "Electrical",
    tagline: "Power Your Business Growth.",
    description:
      "Captures emergency details when you're up to your elbows in a panel. Handles questions about service areas, hourly rates, availability, and routes emergency calls instantly.",
    faqs: [
      {
        question: "How does Halla AI handle electrical emergencies?",
        answer:
          "You define emergency criteria. The AI collects details and immediately notifies your on-call electrician via text with the full job summary.",
      },
      {
        question: "Can the AI provide estimates?",
        answer:
          "Service call fees and hourly rates yes. For full estimates, it schedules an on-site assessment.",
      },
      {
        question: "What if a caller describes something the AI doesn't understand?",
        answer:
          "The AI collects the description verbatim, flags for review, and promises a callback. No technical diagnosis attempted.",
      },
    ],
  },
  {
    slug: "landscaping",
    name: "Landscaping",
    tagline: "Grow Your Business. Never Miss a Spring Call.",
    description:
      "Captures property details, books estimates, and handles mowing schedules, fertilization programs, tree services, and snow removal bookings while you're on a zero-turn or trimming hedges.",
    faqs: [
      {
        question: "Can the AI handle different service frequencies?",
        answer:
          "Yes. Weekly, bi-weekly, monthly, or one-time. Recurring services booked automatically.",
      },
      {
        question: "Can the AI provide mowing quotes?",
        answer:
          "Yes, based on property size using your standard rate. Complex properties require an on-site estimate.",
      },
      {
        question: "How does the AI handle emergency tree removal?",
        answer:
          "Storm-damaged tree calls are dispatched immediately. AI captures tree details and schedules an arborist visit.",
      },
    ],
  },
  {
    slug: "cleaning",
    name: "Home Cleaning",
    tagline: "Clean More Homes. Never Miss a Quote.",
    description:
      "Captures property details, books estimates and recurring services for standard, deep, move-out, and commercial cleaning while you're driving between jobs.",
    faqs: [
      {
        question: "Can the AI provide quotes over the phone?",
        answer:
          "For standard recurring cleans, yes — firm pricing based on bedroom/bathroom count. For deep or move-out cleans, a virtual or in-person estimate is needed.",
      },
      {
        question: "How does Halla AI handle recurring scheduling?",
        answer:
          "Sets up weekly, bi-weekly, or monthly recurring appointments based on route availability. Confirmed via SMS and email.",
      },
      {
        question: "What if a customer needs to skip a week?",
        answer:
          "The AI reschedules single occurrences or modifies the recurring pattern based on your rescheduling policy.",
      },
    ],
  },
  {
    slug: "legal",
    name: "Legal Firms",
    tagline: "Never Miss a Billable Consultation Call.",
    description:
      "Captures potential client details, books initial consultations, and logs intake into your practice management system while you're in court, drafting documents, or meeting with existing clients.",
    faqs: [
      {
        question: "How does Halla AI handle attorney-client confidentiality?",
        answer:
          "All calls processed through encrypted systems. Transcripts stored securely. The AI never shares client info with third parties.",
      },
      {
        question: "Can the AI screen for conflicts of interest?",
        answer:
          "Yes. You provide conflict check questions. The AI collects this during intake and flags potential conflicts before scheduling.",
      },
      {
        question: "Can the AI handle different practice areas?",
        answer:
          "Yes. Separate intake flows per practice area — different questions for PI vs. estate planning vs. criminal defense.",
      },
    ],
  },
];

export type PlaceholderCategory = {
  heading: string;
  items: { label: string; description: string }[];
};

export const PLACEHOLDER_CATEGORIES: PlaceholderCategory[] = [
  {
    heading: "Property & Professional Services",
    items: [
      {
        label: "Property Management",
        description: "Maintenance requests, tenant calls, emergency routing",
      },
    ],
  },
  {
    heading: "Beauty & Automotive",
    items: [
      { label: "Salons & Spas", description: "Booking, pricing, availability" },
      { label: "Auto Repair", description: "Service appointments, estimates" },
    ],
  },
  {
    heading: "Other Services",
    items: [
      { label: "Veterinary", description: "Appointments, emergency triage" },
      { label: "Education", description: "Enrollment, tuition, scheduling" },
    ],
  },
];
