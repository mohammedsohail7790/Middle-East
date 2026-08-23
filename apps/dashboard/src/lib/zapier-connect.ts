import { ZAPIER_CATCH_HOOK_INTENT, ZAPIER_CRM_APP_URLS, type CrmCatalogId } from "@/lib/integrations-catalog";

/** Shared Zap template URLs — create once in Zapier (Share → copy link), set in Vercel env. */
const ZAPIER_TEMPLATE_BY_INTEGRATION: Record<string, string | undefined> = {
  pipedrive: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_PIPEDRIVE,
  freshsales: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_FRESHSALES,
  insightly: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_INSIGHTLY,
  zoho: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_ZOHO,
  copper: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_COPPER,
  followupboss: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_FOLLOWUPBOSS,
  clio: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_CLIO,
  mycase: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_MYCASE,
  acuity: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_ACUITY,
  setmore: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_SETMORE,
  "square-appointments": process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_SQUARE_APPOINTMENTS,
  vagaro: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_VAGARO,
  mindbody: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_MINDBODY,
  servicetitan: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_SERVICETITAN,
  jobber: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_JOBBER,
  housecallpro: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_HOUSECALLPRO,
  buildium: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_BUILDIUM,
  appfolio: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_APPFOLIO,
  yardi: process.env.NEXT_PUBLIC_ZAPIER_TEMPLATE_YARDI,
};

export function isZapierPartnerOAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ZAPIER_CLIENT_ID?.trim());
}

/** Pre-built shared Zap for this integration, if configured in env. */
export function getZapierTemplateUrl(integrationId: string): string | null {
  const url = ZAPIER_TEMPLATE_BY_INTEGRATION[integrationId]?.trim();
  return url || null;
}

/** Open integrations page scrolled to Zapier with CRM pre-selected. */
export function navigateToZapierSetup(integrationId: string): void {
  const url = new URL("/dashboard/integrations", window.location.origin);
  url.searchParams.set("crm", integrationId);
  url.hash = "zapier-connect";
  window.location.assign(url.toString());
}

/** Best one-click URL: shared template, or Catch Hook + CRM hint. */
export function getZapierEasyStartUrl(integrationId: string): string {
  const template = getZapierTemplateUrl(integrationId);
  if (template) return template;

  const crmUrl = ZAPIER_CRM_APP_URLS[integrationId as CrmCatalogId];
  if (crmUrl) return crmUrl;

  return ZAPIER_CATCH_HOOK_INTENT;
}

export function hasZapierTemplate(integrationId: string): boolean {
  return getZapierTemplateUrl(integrationId) != null;
}
