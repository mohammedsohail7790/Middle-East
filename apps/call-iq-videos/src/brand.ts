export const brand = {
  name: "Halla AI",
  tagline: "Smart • Seamless • Always",
  website: "www.hallaai.com",
  websiteUrl: "https://www.hallaai.com",
  colors: {
    cyan: "#0EA5E9",
    dark: "#0A0A0A",
    white: "#FFFFFF",
    gray: "#1A1A1A",
    grayLight: "#2A2A2A",
    muted: "#94A3B8",
  },
} as const;

export const features = [
  {
    id: "ai-answers",
    title: "AI Answers Every Call",
    description: "24/7 intelligent voice receptionist that never misses a lead.",
    icon: "phone",
  },
  {
    id: "lead-capture",
    title: "Instant Lead Capture",
    description: "Qualify callers and sync leads to your dashboard automatically.",
    icon: "users",
  },
  {
    id: "analytics",
    title: "Real-Time Analytics",
    description: "Track call volume, conversion rates, and agent performance.",
    icon: "chart",
  },
  {
    id: "seamless",
    title: "Seamless Integration",
    description: "Connect with your existing tools in minutes, not weeks.",
    icon: "link",
  },
] as const;

export const benefits = [
  { title: "Never Miss a Call", subtitle: "24/7 AI coverage" },
  { title: "Capture More Leads", subtitle: "Auto-qualify every caller" },
  { title: "Save Hours Daily", subtitle: "No manual follow-ups" },
] as const;

export const copy = {
  hook: "Missing calls = lost revenue",
  problem: "Every unanswered call is a customer walking away.",
  solution: "Halla AI answers, qualifies, and converts — automatically.",
  cta: "Start Free at hallaai.com",
  ctaShort: "Try Halla AI Free",
  downloadCta: "Get Started Free",
  reelHook: "Your AI receptionist is here",
  explainerProblem: "Small businesses lose 62% of calls after hours.",
  explainerSteps: [
    "Halla AI answers instantly with natural AI voice",
    "Qualifies leads and books appointments",
    "Delivers insights to your dashboard",
  ],
} as const;
