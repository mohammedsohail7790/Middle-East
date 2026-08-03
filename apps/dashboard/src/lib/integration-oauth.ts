import { api } from "@/lib/api";
import type { IntegrationDef } from "@/lib/integration-hub-catalog";

/** Start provider OAuth — optional domain/dataCenter values for Freshsales/Zoho. */
export async function startIntegrationOAuth(
  integration: IntegrationDef,
  values: Record<string, string> = {}
): Promise<void> {
  if (!integration.oauthAuthPath) {
    throw new Error(`${integration.name} sign-in is not available`);
  }

  const domain = values.domain?.trim();
  const dataCenter = values.dataCenter?.trim();
  let path = integration.oauthAuthPath;

  if (dataCenter && integration.fields?.some((f) => f.key === "dataCenter")) {
    path = `${path}?dataCenter=${encodeURIComponent(dataCenter)}`;
  } else if (domain && integration.fields?.some((f) => f.key === "domain")) {
    path = `${path}?domain=${encodeURIComponent(domain)}`;
  }

  const url = await api.getOAuthRedirectUrl(path);
  window.location.assign(url);
}
