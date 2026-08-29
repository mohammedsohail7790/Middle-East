export type Capability = string;

export type ServiceItem = {
  label: string;
  icon: "settings" | "trending-up" | "sparkles";
  title: string;
  description: string;
  bullets: string[];
  href: string;
  exploreLabel: string;
  featured?: boolean;
  featuredBadge?: string;
};

export type TimelineStep = { number: string; title: string; description: string };

export type ComparisonRow = {
  need: string;
  hallaAi: string;
  diy: string;
  agency: string;
  agencyNegative?: boolean;
};
