/** Single source of truth for dashboard sidebar, breadcrumbs, and assistant context. */

export type NavPlan = "essential" | "professional";

export interface DashboardNavItem {
  href: string;
  label: string;
  plan?: NavPlan;
  /** Shown in topbar under the page title */
  subtitle?: string;
}

export interface DashboardNavGroup {
  label: string;
  items: DashboardNavItem[];
}

const PLAN_LABEL: Record<NavPlan, string> = {
  essential: "Starter",
  professional: "Professional",
};

export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", subtitle: "Performance, volume, and recent activity" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/calls", label: "Calls", subtitle: "Transcripts, outcomes, and call history" },
      { href: "/dashboard/leads", label: "Leads", subtitle: "Pipeline stages and conversion" },
      { href: "/dashboard/agent", label: "AI Agent", subtitle: "Voice, tone, and routing rules" },
      { href: "/dashboard/calendar", label: "Calendar", subtitle: "Appointments and availability" },
      { href: "/dashboard/analytics", label: "Analytics", plan: "professional", subtitle: "Trends, funnels, and KPIs" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/dashboard/integrations", label: "Integrations", subtitle: "CRMs, calendars, and automations" },
      { href: "/dashboard/knowledge", label: "Business Profile", subtitle: "Company details, service area, and AI training content" },
      { href: "/dashboard/phone-numbers", label: "Phone Numbers", subtitle: "Inbound numbers and routing" },
      { href: "/dashboard/compliance", label: "Compliance", subtitle: "AI disclosure, call recording, retention, and audit log" },
      { href: "/dashboard/billing", label: "Billing", subtitle: "Plan, usage, and invoices" },
      { href: "/dashboard/settings/spam", label: "Spam Protection", subtitle: "Block robocalls and unwanted callers" },
      { href: "/dashboard/support", label: "Support", subtitle: "Help, docs, and contact" },
    ],
  },
];

export const DASHBOARD_NAV_FLAT: DashboardNavItem[] = DASHBOARD_NAV_GROUPS.flatMap((g) => g.items);

export function navItemByPath(pathname: string): DashboardNavItem | undefined {
  const exact = DASHBOARD_NAV_FLAT.find((item) => item.href === pathname);
  if (exact) return exact;
  return DASHBOARD_NAV_FLAT.find(
    (item) => item.href !== "/dashboard" && pathname.startsWith(item.href),
  );
}

export function navRouteKey(pathname: string): string {
  if (!pathname?.startsWith("/dashboard")) return "dashboard";
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 1) return "dashboard";
  if (parts.length >= 3 && parts[1] === "calls") return "calls";
  if (parts.length >= 3 && parts[1] === "settings") return parts[2] === "features" ? "settings-features" : "settings";
  return parts[1];
}

export function navPageTitle(pathname: string): string {
  if (pathname?.match(/\/dashboard\/calls\/[^/]+/)) return "Call detail";
  const item = navItemByPath(pathname);
  if (item) return item.label;
  const key = navRouteKey(pathname);
  return key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function navPageSubtitle(pathname: string): string {
  if (pathname?.match(/\/dashboard\/calls\/[^/]+/)) return "Transcript and outcome";
  return navItemByPath(pathname)?.subtitle ?? "Workspace";
}

export function navLockedTitle(item: DashboardNavItem, locked: boolean): string | undefined {
  if (locked && item.plan) {
    return `${item.label} — requires ${PLAN_LABEL[item.plan]} plan`;
  }
  return item.label;
}

export function allNavHrefs(): string[] {
  return DASHBOARD_NAV_FLAT.map((i) => i.href);
}
