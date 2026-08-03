/** Self-hosted + official brand logos for integration UI (public/integrations). */

export type IntegrationBrand = {
  name: string;
  /** Primary logo path or URL — local assets preferred for reliability */
  logoUrl: string;
  /** Optional fallbacks if primary fails to load */
  fallbacks?: string[];
  tileClass: string;
};

const LOCAL = (file: string) => `/integrations/${file}`;

export const INTEGRATION_BRANDS: Record<string, IntegrationBrand> = {
  zapier: {
    name: "Zapier",
    logoUrl: LOCAL("zapier.svg"),
    tileClass: "bg-white",
  },
  hubspot: {
    name: "HubSpot",
    logoUrl: LOCAL("hubspot.svg"),
    tileClass: "bg-white",
  },
  slack: {
    name: "Slack",
    logoUrl: LOCAL("slack.svg"),
    tileClass: "bg-white",
  },
  "google-calendar": {
    name: "Google Calendar",
    logoUrl: LOCAL("googlecalendar.svg"),
    tileClass: "bg-white",
  },
  outlook: {
    name: "Outlook",
    logoUrl: LOCAL("microsoftoutlook.svg"),
    tileClass: "bg-white",
  },
  calendly: {
    name: "Calendly",
    logoUrl: LOCAL("calendly.svg"),
    tileClass: "bg-white",
  },
  pipedrive: {
    name: "Pipedrive",
    logoUrl: LOCAL("pipedrive.svg"),
    tileClass: "bg-[#ECF7F0]",
  },
  zoho: {
    name: "Zoho CRM",
    logoUrl: LOCAL("zoho.svg"),
    tileClass: "bg-white",
  },
  salesforce: {
    name: "Salesforce",
    logoUrl: LOCAL("salesforce.svg"),
    tileClass: "bg-white",
  },
  copper: {
    name: "Copper",
    logoUrl: LOCAL("copper.png"),
    tileClass: "bg-[#FFF5F4]",
  },
  followupboss: {
    name: "Follow Up Boss",
    logoUrl: LOCAL("followupboss.png"),
    tileClass: "bg-white",
  },
  setmore: {
    name: "Setmore",
    logoUrl: LOCAL("setmore.svg"),
    tileClass: "bg-white",
  },
  buildium: {
    name: "Buildium",
    logoUrl: LOCAL("buildium.png"),
    tileClass: "bg-white",
  },
  yardi: {
    name: "Yardi",
    logoUrl: LOCAL("yardi.png"),
    tileClass: "bg-white",
  },
  freshsales: {
    name: "Freshsales",
    logoUrl: LOCAL("freshsales.png"),
    tileClass: "bg-[#FFF4E8]",
  },
  insightly: {
    name: "Insightly",
    logoUrl: LOCAL("insightly.png"),
    tileClass: "bg-[#EEF4FC]",
  },
  servicetitan: {
    name: "ServiceTitan",
    logoUrl: LOCAL("servicetitan.png"),
    tileClass: "bg-white",
  },
  jobber: {
    name: "Jobber",
    logoUrl: LOCAL("jobber.png"),
    tileClass: "bg-[#F0FAEE]",
  },
  housecallpro: {
    name: "Housecall Pro",
    logoUrl: LOCAL("housecallpro.png"),
    tileClass: "bg-[#EEF6FF]",
  },
  clio: {
    name: "Clio",
    logoUrl: LOCAL("clio.png"),
    tileClass: "bg-white",
  },
  mycase: {
    name: "MyCase",
    logoUrl: LOCAL("mycase.webp"),
    fallbacks: [LOCAL("mycase.png")],
    tileClass: "bg-white",
  },
  acuity: {
    name: "Acuity Scheduling",
    logoUrl: LOCAL("acuity.png"),
    tileClass: "bg-white",
  },
  "square-appointments": {
    name: "Square Appointments",
    logoUrl: LOCAL("square-appointments.svg"),
    tileClass: "bg-white",
  },
  vagaro: {
    name: "Vagaro",
    logoUrl: LOCAL("vagaro.png"),
    tileClass: "bg-white",
  },
  mindbody: {
    name: "Mindbody",
    logoUrl: LOCAL("mindbody.png"),
    tileClass: "bg-white",
  },
  appfolio: {
    name: "AppFolio",
    logoUrl: LOCAL("appfolio.png"),
    tileClass: "bg-white",
  },
};

export function getIntegrationBrand(id: string): IntegrationBrand | undefined {
  return INTEGRATION_BRANDS[id];
}

export function getIntegrationLogoSources(id: string): string[] {
  const brand = getIntegrationBrand(id);
  if (!brand) return [];
  return [brand.logoUrl, ...(brand.fallbacks ?? [])];
}
