/** Single source of truth for dashboard sidebar, breadcrumbs, and assistant context. */

export type NavPlan = "essential" | "professional";

export interface DashboardNavItem {
  href: string;
  label: string;
  /** next-intl message key resolving to the translated label */
  labelKey: string;
  plan?: NavPlan;
  /** Shown in topbar under the page title */
  subtitle?: string;
  /** next-intl message key resolving to the translated subtitle */
  subtitleKey?: string;
}

export interface DashboardNavGroup {
  label: string;
  /** next-intl message key resolving to the translated group label */
  labelKey: string;
  items: DashboardNavItem[];
}

const PLAN_LABEL: Record<NavPlan, string> = {
  essential: "Starter",
  professional: "Professional",
};

export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  {
    label: "Overview",
    labelKey: "navGroups.overview",
    items: [
      { href: "/dashboard", label: "Dashboard", labelKey: "nav.dashboard", subtitle: "Performance, volume, and recent activity", subtitleKey: "nav.dashboardSubtitle" },
    ],
  },
  {
    label: "Operations",
    labelKey: "navGroups.operations",
    items: [
      { href: "/dashboard/leads", label: "Leads", labelKey: "nav.leads", subtitle: "Pipeline stages and conversion", subtitleKey: "nav.leadsSubtitle" },
      { href: "/dashboard/agent", label: "Voice Agents", labelKey: "nav.voiceAgents", subtitle: "Voice, tone, and routing rules", subtitleKey: "nav.voiceAgentsSubtitle" },
      { href: "/dashboard/calendar", label: "Calendar", labelKey: "nav.calendar", subtitle: "Appointments and availability", subtitleKey: "nav.calendarSubtitle" },
      { href: "/dashboard/analytics", label: "Analytics", labelKey: "nav.analytics", plan: "professional", subtitle: "Trends, funnels, and KPIs", subtitleKey: "nav.analyticsSubtitle" },
      { href: "/dashboard/quality", label: "Quality", labelKey: "nav.quality", subtitle: "Call scoring, sentiment, and lead quality", subtitleKey: "nav.qualitySubtitle" },
    ],
  },
  {
    label: "Channels",
    labelKey: "navGroups.channels",
    items: [
      { href: "/dashboard/calls", label: "Calls", labelKey: "nav.calls", subtitle: "Transcripts, outcomes, and call history", subtitleKey: "nav.callsSubtitle" },
      { href: "/dashboard/outbound", label: "Outbound", labelKey: "nav.outbound", subtitle: "Click-to-call, campaigns, and reminders", subtitleKey: "nav.outboundSubtitle" },
    ],
  },
  {
    label: "CRM",
    labelKey: "navGroups.crm",
    items: [
      { href: "/dashboard/crm/contacts", label: "Contacts", labelKey: "nav.crmContacts", subtitle: "People associated with your business", subtitleKey: "nav.crmContactsSubtitle" },
      { href: "/dashboard/crm/companies", label: "Companies", labelKey: "nav.crmCompanies", subtitle: "Organizations you do business with", subtitleKey: "nav.crmCompaniesSubtitle" },
      { href: "/dashboard/crm/deals", label: "Deals", labelKey: "nav.crmDeals", subtitle: "Open and closed opportunities", subtitleKey: "nav.crmDealsSubtitle" },
    ],
  },
  {
    label: "Platform",
    labelKey: "navGroups.platform",
    items: [
      { href: "/dashboard/integrations", label: "Integrations", labelKey: "nav.integrations", subtitle: "CRMs, calendars, and automations", subtitleKey: "nav.integrationsSubtitle" },
      { href: "/dashboard/knowledge", label: "Knowledge Base", labelKey: "nav.knowledgeBase", subtitle: "Company details, service area, and AI training content", subtitleKey: "nav.knowledgeBaseSubtitle" },
      { href: "/dashboard/phone-numbers", label: "Phone Numbers", labelKey: "nav.phoneNumbers", subtitle: "Inbound numbers and routing", subtitleKey: "nav.phoneNumbersSubtitle" },
      { href: "/dashboard/compliance", label: "Compliance", labelKey: "nav.compliance", subtitle: "AI disclosure, call recording, retention, and audit log", subtitleKey: "nav.complianceSubtitle" },
      { href: "/dashboard/billing", label: "Billing", labelKey: "nav.billing", subtitle: "Plan, usage, and invoices", subtitleKey: "nav.billingSubtitle" },
      { href: "/dashboard/settings/spam", label: "Spam Protection", labelKey: "nav.spamProtection", subtitle: "Block robocalls and unwanted callers", subtitleKey: "nav.spamProtectionSubtitle" },
      { href: "/dashboard/support", label: "Support", labelKey: "nav.support", subtitle: "Help, docs, and contact", subtitleKey: "nav.supportSubtitle" },
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

export function navLockedTitle(item: DashboardNavItem, locked: boolean, label?: string): string | undefined {
  const resolvedLabel = label ?? item.label;
  if (locked && item.plan) {
    return `${resolvedLabel} — requires ${PLAN_LABEL[item.plan]} plan`;
  }
  return resolvedLabel;
}

export function allNavHrefs(): string[] {
  return DASHBOARD_NAV_FLAT.map((i) => i.href);
}
