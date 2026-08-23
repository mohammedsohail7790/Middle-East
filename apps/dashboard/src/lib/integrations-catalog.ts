/** Shared integration catalog — aligns with marketing site + gateway providers */

export type CrmCatalogId =
  | "pipedrive"
  | "zoho"
  | "copper"
  | "freshsales"
  | "insightly"
  | "servicetitan"
  | "jobber"
  | "housecallpro"
  | "other";

export type DirectProviderId =
  | "zapier"
  | "hubspot"
  | "google-calendar"
  | "outlook"
  | "calendly"
  | "slack";

export type CrmCatalogItem = {
  id: CrmCatalogId;
  name: string;
  icon: string;
  tagline: string;
  zapAction: string;
  fieldMap: string[];
};

/** Opens Zapier editor with Webhooks → Catch Hook pre-selected (new tab). */
export const ZAPIER_CATCH_HOOK_INTENT =
  "https://zapier.com/webintent/create-zap?steps[0][app]=WebHookAPI&steps[0][action]=hook_v2";

/** Fallback if webintent is blocked — Webhooks by Zapier app page. */
export const ZAPIER_WEBHOOKS_APP_URL = "https://zapier.com/apps/webhook/integrations";

/** Step 2 in Zapier — add the client's CRM as an action. */
export const ZAPIER_CRM_APP_URLS: Partial<Record<CrmCatalogId, string>> = {
  pipedrive: "https://zapier.com/apps/pipedrive/integrations",
  zoho: "https://zapier.com/apps/zoho-crm/integrations",
  copper: "https://zapier.com/apps/copper/integrations",
  freshsales: "https://zapier.com/apps/freshsales/integrations",
  insightly: "https://zapier.com/apps/insightly/integrations",
  servicetitan: "https://zapier.com/apps/servicetitan/integrations",
  jobber: "https://zapier.com/apps/jobber/integrations",
  housecallpro: "https://zapier.com/apps/housecall-pro/integrations",
  other: "https://zapier.com/apps",
};

export const ZAPIER_SETUP_SCREENSHOTS = [
  "/screenshots/zapier/step-01.svg",
  "/screenshots/zapier/step-02.svg",
  "/screenshots/zapier/step-03.svg",
  "/screenshots/zapier/step-04.svg",
];

import { SUPPORT_EMAIL } from "@/lib/integration-support";

export const CRM_SETUP_SUPPORT_EMAIL = SUPPORT_EMAIL;

export const SELECTED_CRMS_STORAGE_KEY = "calliq_selected_crms_v1";

/** CRMs marketed on the site — all connect via one Zapier Catch Hook */
export const CRM_CATALOG: CrmCatalogItem[] = [
  {
    id: "pipedrive",
    name: "Pipedrive",
    icon: "🟢",
    tagline: "Sales pipeline & deals",
    zapAction: "Pipedrive → Create Person or Create Deal",
    fieldMap: ["lead.name → Name", "lead.phone → Phone", "lead.email → Email", "lead.service → Note"],
  },
  {
    id: "zoho",
    name: "Zoho CRM",
    icon: "🔴",
    tagline: "Leads, contacts & accounts",
    zapAction: "Zoho CRM → Create Lead or Contact",
    fieldMap: ["lead.name → Full Name", "lead.phone → Phone", "lead.email → Email", "lead.notes → Description"],
  },
  {
    id: "copper",
    name: "Copper",
    icon: "🟤",
    tagline: "Google Workspace CRM",
    zapAction: "Copper → Create Person or Lead",
    fieldMap: ["lead.name → Name", "lead.phone → Phone", "lead.email → Email"],
  },
  {
    id: "freshsales",
    name: "Freshsales",
    icon: "🍊",
    tagline: "Freshworks sales CRM",
    zapAction: "Freshsales → Create Lead or Contact",
    fieldMap: ["lead.name → Name", "lead.phone → Mobile", "lead.email → Email"],
  },
  {
    id: "insightly",
    name: "Insightly",
    icon: "🔵",
    tagline: "CRM & project tracking",
    zapAction: "Insightly → Create Contact or Lead",
    fieldMap: ["lead.name → Name", "lead.phone → Phone", "lead.email → Email"],
  },
  {
    id: "servicetitan",
    name: "ServiceTitan",
    icon: "🔧",
    tagline: "Field service & dispatch",
    zapAction: "ServiceTitan → Create Customer or Job",
    fieldMap: ["lead.name → Customer name", "lead.phone → Phone", "lead.service → Job type / summary"],
  },
  {
    id: "jobber",
    name: "Jobber",
    icon: "🏠",
    tagline: "Home service management",
    zapAction: "Jobber → Create Client or Request",
    fieldMap: ["lead.name → Name", "lead.phone → Phone", "lead.email → Email", "lead.notes → Notes"],
  },
  {
    id: "housecallpro",
    name: "Housecall Pro",
    icon: "🏡",
    tagline: "Scheduling & dispatch",
    zapAction: "Housecall Pro → Create Customer or Job",
    fieldMap: ["lead.name → Name", "lead.phone → Phone", "lead.email → Email"],
  },
  {
    id: "other",
    name: "Another CRM",
    icon: "✨",
    tagline: "Any of 5,000+ Zapier apps",
    zapAction: "Search your CRM in Zapier → Create contact/lead action",
    fieldMap: ["lead.name", "lead.phone", "lead.email", "lead.service", "lead.notes"],
  },
];

export function getCrmCatalogItem(id: string): CrmCatalogItem | undefined {
  return CRM_CATALOG.find((c) => c.id === id);
}

export function readSelectedCrms(): CrmCatalogId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SELECTED_CRMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return parsed.filter((id): id is CrmCatalogId => CRM_CATALOG.some((c) => c.id === id));
  } catch {
    return [];
  }
}

export function writeSelectedCrms(ids: CrmCatalogId[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SELECTED_CRMS_STORAGE_KEY, JSON.stringify(ids));
}

export type CredentialField = {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder: string;
  required: boolean;
};

export type DirectIntegrationDef = {
  id: DirectProviderId;
  name: string;
  icon: string;
  category: "calendar" | "communication" | "crm" | "automation";
  description: string;
  connection: "oauth" | "webhook";
  plan_required: string | null;
  fields: CredentialField[];
};

export const DIRECT_INTEGRATIONS: DirectIntegrationDef[] = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    icon: "📅",
    category: "calendar",
    description: "Book appointments on your Google Calendar during calls.",
    connection: "oauth",
    plan_required: null,
    fields: [],
  },
  {
    id: "outlook",
    name: "Outlook Calendar",
    icon: "📧",
    category: "calendar",
    description: "Sync appointments with Microsoft Outlook.",
    connection: "oauth",
    plan_required: "professional",
    fields: [],
  },
  {
    id: "calendly",
    name: "Calendly",
    icon: "📆",
    category: "calendar",
    description: "Import Calendly bookings and scheduling links into Call IQ.",
    connection: "oauth",
    plan_required: "professional",
    fields: [],
  },
  {
    id: "slack",
    name: "Slack",
    icon: "💬",
    category: "communication",
    description: "Alerts for new calls, leads, and appointments.",
    connection: "oauth",
    plan_required: null,
    fields: [],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    icon: "🟠",
    category: "crm",
    description: "One-click OAuth — sync contacts without Zapier.",
    connection: "oauth",
    plan_required: null,
    fields: [],
  },
];

export const OAUTH_AUTH_PATHS: Record<string, string> = {
  "google-calendar": "/calendar/google/auth-url",
  outlook: "/calendar/outlook/auth-url",
  calendly: "/calendar/calendly/auth-url",
  slack: "/integrations/slack/auth-url",
  hubspot: "/integrations/hubspot/auth-url",
};

/** Disconnect via calendar API (provider slug on gateway). */
export const CALENDAR_DISCONNECT_SLUG: Record<string, string> = {
  "google-calendar": "google",
  outlook: "outlook",
  calendly: "calendly",
};

export const DIRECT_CATEGORY_LABELS: Record<DirectIntegrationDef["category"], string> = {
  calendar: "Calendars",
  communication: "Communication",
  crm: "Direct CRM (OAuth)",
  automation: "Automation",
};
