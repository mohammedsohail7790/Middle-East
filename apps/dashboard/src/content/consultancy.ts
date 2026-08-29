export type Capability = string;

export const CAPABILITIES: Capability[] = [
  "Process Mapping",
  "Workflow Automation",
  "Lead Engines",
  "CRM Integration",
  "AI Receptionist",
  "Brand Systems",
  "Review Automation",
  "Live Dashboards",
];

export type ServiceItem = {
  label: string;
  icon: "settings" | "trending-up" | "sparkles";
  title: string;
  description: string;
  bullets: string[];
  href: string;
  featured?: boolean;
  featuredBadge?: string;
};

export const SERVICES: ServiceItem[] = [
  {
    label: "Efficiency",
    icon: "settings",
    title: "Operations Automation",
    description:
      "We find the manual, repeatable work eating your team's time and hand it to AI — including your call handling with Halla AI.",
    bullets: [
      "Workflow & process automation",
      "Document & data handling",
      "AI receptionist & scheduling",
      "Internal reporting & dashboards",
    ],
    href: "/services/operations",
  },
  {
    label: "Revenue",
    icon: "trending-up",
    title: "Client Acquisition & Growth",
    description:
      "We build systems that find, qualify, and follow up with new customers — automatically, within seconds.",
    bullets: [
      "AI lead generation & qualification",
      "Instant lead follow-up systems",
      "Sales outreach automation",
      "CRM & pipeline integration",
    ],
    href: "/services/acquisition",
    featured: true,
    featuredBadge: "Most requested",
  },
  {
    label: "Visibility",
    icon: "sparkles",
    title: "AI-Powered Brand & Social",
    description:
      "We use AI to keep your business consistently visible, without it becoming another job on your plate.",
    bullets: [
      "AI-assisted content & posting",
      "Social media growth systems",
      "Review & reputation management",
      "On-brand messaging at scale",
    ],
    href: "/services/brand",
  },
];

export type TimelineStep = { number: string; title: string; description: string };

export const HOW_WE_WORK_STEPS: TimelineStep[] = [
  {
    number: "01",
    title: "Diagnostic call",
    description:
      "We trace where time and revenue leak — no jargon, no 40-slide deck. You leave with a clear priority list.",
  },
  {
    number: "02",
    title: "Map, then build",
    description:
      "Our AI engineer maps your actual operations and builds a working system in production — not a demo environment.",
  },
  {
    number: "03",
    title: "One owner, full team",
    description:
      "You work directly with one point of contact from scoping to delivery. A dedicated AI team builds behind the scenes.",
  },
  {
    number: "04",
    title: "Measure & tune",
    description:
      "Success is hours saved, leads generated, and revenue booked. If a system isn't delivering, we fix it or kill it.",
  },
];

export type ComparisonRow = {
  need: string;
  hallaAi: string;
  diy: string;
  agency: string;
  agencyNegative?: boolean;
};

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    need: "Connected systems, not one-off tools",
    hallaAi: "One layer across ops, sales & social",
    diy: "Disconnected apps, manual glue work",
    agency: "Often siloed by department",
  },
  {
    need: "Time to see it working",
    hallaAi: "Weeks, in production",
    diy: "Ongoing trial and error",
    agency: "Months of discovery phases",
  },
  {
    need: "Who you talk to",
    hallaAi: "One direct point of contact, backed by a full AI team",
    diy: "You, on top of everything else",
    agency: "Account manager, junior team",
  },
  {
    need: "Ongoing cost if it doesn't work",
    hallaAi: "No retainers for systems that don't deliver",
    diy: "Your time, indefinitely",
    agency: "Often locked into contracts",
    agencyNegative: true,
  },
];
