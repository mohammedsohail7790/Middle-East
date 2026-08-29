export type PricingPlan = {
  id: string;
  name: string;
  price: number;
  priceSuffix: string;
  minutesLabel: string;
  ctaLabel: string;
  ctaVariant: "default" | "outline";
  popular?: boolean;
  features: string[];
  missingFeatures: string[];
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "essential",
    name: "Essential",
    price: 39,
    priceSuffix: "/mo",
    minutesLabel: "250 min · $0.20/min overage",
    ctaLabel: "Start Free Trial",
    ctaVariant: "outline",
    features: [
      "24/7 AI receptionist",
      "7 Languages",
      "Call forwarding",
      "Voicemail-to-text",
      "Appointment booking",
      "Email summaries",
      "Live chat (7am–3pm ET)",
      "1 phone number",
    ],
    missingFeatures: ["CRM integration", "Native calendar sync", "Custom AI voice"],
  },
  {
    id: "professional",
    name: "Professional",
    price: 149,
    priceSuffix: "/mo",
    minutesLabel: "750 min · $0.15/min overage",
    ctaLabel: "Start Free Trial",
    ctaVariant: "default",
    popular: true,
    features: [
      "Everything in Essential",
      "CRM (HubSpot, Salesforce, Pipedrive)",
      "Google Calendar + Outlook sync",
      "Custom AI voice training",
      "3 phone numbers",
    ],
    missingFeatures: ["Dedicated account manager"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 499,
    priceSuffix: "/mo",
    minutesLabel: "4,000 min · $0.10/min overage",
    ctaLabel: "Start Free Trial",
    ctaVariant: "outline",
    features: [
      "Everything in Professional",
      "Dedicated account manager",
      "99.9% uptime SLA",
      "Advanced analytics & reporting",
      "20+ phone numbers",
      "Custom data residency options",
    ],
    missingFeatures: [],
  },
];

export type AnnualSavingsRow = {
  plan: string;
  annualPrice: string;
  effectiveMonthly: string;
  savings: string;
};

export const ANNUAL_SAVINGS_ROWS: AnnualSavingsRow[] = [
  { plan: "Essential", annualPrice: "$375/year", effectiveMonthly: "$31.25", savings: "Save $93/year" },
  { plan: "Professional", annualPrice: "$1,430/year", effectiveMonthly: "$119.17", savings: "Save $358/year" },
  { plan: "Enterprise", annualPrice: "$4,790/year", effectiveMonthly: "$399.17", savings: "Save $1,198/year" },
];

export type FeatureComparisonRow = {
  feature: string;
  essential: string;
  professional: string;
  enterprise: string;
};

export const FEATURE_COMPARISON_ROWS: FeatureComparisonRow[] = [
  { feature: "Monthly price", essential: "$39", professional: "$149", enterprise: "$499" },
  { feature: "Included minutes", essential: "250", professional: "750", enterprise: "4,000" },
  { feature: "Overage rate", essential: "$0.20/min", professional: "$0.15/min", enterprise: "$0.10/min" },
  { feature: "24/7 AI receptionist", essential: "✓", professional: "✓", enterprise: "✓" },
  { feature: "7 Languages", essential: "✓", professional: "✓", enterprise: "✓" },
  { feature: "Spam blocking", essential: "✓", professional: "✓", enterprise: "✓" },
  { feature: "CRM integration", essential: "Basic (Zapier)", professional: "Full (Native + Zapier)", enterprise: "Full + custom API" },
  { feature: "Native calendar sync", essential: "—", professional: "✓", enterprise: "✓" },
  { feature: "Custom AI voice", essential: "—", professional: "✓", enterprise: "✓" },
  { feature: "Phone numbers", essential: "1", professional: "3", enterprise: "20+" },
  { feature: "Dedicated account manager", essential: "—", professional: "—", enterprise: "✓" },
  { feature: "Uptime SLA", essential: "—", professional: "—", enterprise: "99.9%" },
  { feature: "Call recording", essential: "Optional, opt-in", professional: "Optional, opt-in", enterprise: "Optional, opt-in" },
];

export type RoiPlanOption = { label: string; value: number };

export const ROI_PLAN_OPTIONS: RoiPlanOption[] = [
  { label: "Essential — $39/mo", value: 39 },
  { label: "Professional — $149/mo", value: 149 },
];
