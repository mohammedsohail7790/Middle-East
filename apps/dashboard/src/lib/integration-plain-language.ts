import type { IntegrationDef, IntegrationField } from "@/lib/integration-hub-catalog";

type PlainCopy = {
  label: string;
  placeholder: string;
  helpTitle?: string;
  helpBody?: string;
};

const PASTE_HINT =
  "Open the settings page, find the item we show in the picture, copy it, then paste it in the box below.";

function pasteField(integrationName: string, whatToCopy: string): PlainCopy {
  return {
    label: `Paste your ${whatToCopy}`,
    placeholder: "Paste here",
    helpTitle: `Where to find this in ${integrationName}`,
    helpBody: PASTE_HINT,
  };
}

/** Plain-English labels — clients never need to know what an API key is. */
export function getPlainCredentialCopy(
  integration: IntegrationDef,
  field: IntegrationField
): PlainCopy {
  const name = integration.name;
  const key = field.key;

  const byKey: Record<string, PlainCopy> = {
    apiKey:
      integration.id === "copper"
        ? {
            label: "Paste your API key",
            placeholder: "Paste your Copper API key",
            helpTitle: "Where to find your API key in Copper",
            helpBody:
              "In Copper open System settings → API Keys, click Generate API Key, then copy the full key here.",
          }
        : pasteField(name, "connection code"),
    apiToken: pasteField(name, "connection code"),
    accessToken: pasteField(name, "connection code"),
    clientSecret: pasteField(name, "secret connection code"),
    refreshToken: pasteField(name, "long connection code"),
    webhookUrl: {
      label: "Paste your Zapier link",
      placeholder: "Paste the link from Zapier here",
      helpTitle: "From Zapier",
      helpBody:
        "In Zapier, create a Webhook trigger and copy the link it gives you. Paste that link here.",
    },
    domain:
      integration.id === "freshsales"
        ? {
            label: "Your Freshworks organization domain",
            placeholder: "acme.myfreshworks.com",
            helpTitle: `Your ${name} org domain`,
            helpBody:
              "After signing into Freshsales, check the address bar for your org domain (e.g. acme.myfreshworks.com). You can also enter just the subdomain from acme-hvac.freshsales.io.",
          }
        : {
            label: "Your company login name",
            placeholder: "e.g. acme-hvac",
            helpTitle: `Your ${name} web address`,
            helpBody: `Look at the address bar when you're logged into ${name}. Use only the first part — for example, if you see acme-hvac.freshsales.io, type acme-hvac.`,
          },
    apiDomain:
      integration.id === "yardi"
        ? {
            label: "Paste your Yardi API link",
            placeholder: "https://api.yourcompany.com",
            helpTitle: "From your Yardi representative",
            helpBody: "Paste the full API URL Yardi gave you when they enabled API access.",
          }
        : {
            label: "Your company login name",
            placeholder: "e.g. acme-hvac",
            helpTitle: `Your ${name} web address`,
            helpBody: `When logged into ${name}, look at the browser address and enter only the company name portion.`,
          },
    userId: {
      label: "Your user number",
      placeholder: "Numbers shown on the settings page",
      helpTitle: "On the same settings page",
      helpBody:
        "This is a short number at the top of the Integrations page in Acuity. Copy it exactly.",
    },
    companyId: {
      label: "Your company number",
      placeholder: "Short number on the same page",
      helpTitle: "Right below your connection code",
      helpBody:
        "On the same Housecall Pro settings page, you'll see a small company number. Copy it here.",
    },
    tenantId: {
      label: "Your ServiceTitan company number",
      placeholder: "Numbers from ServiceTitan settings",
      helpTitle: "On the ServiceTitan integrations page",
      helpBody:
        "ServiceTitan shows a company number on the API settings page. Copy that number here.",
    },
    appKey: pasteField(name, "app connection code"),
    clientId: {
        label: "First connection code",
        placeholder: "Paste from settings",
        helpTitle: `From ${name} settings`,
        helpBody: PASTE_HINT,
      },
    userEmail: {
      label: "Your login email",
      placeholder: "you@company.com",
      helpTitle: "The email you use for Copper",
      helpBody: "Enter the same email address you use to sign in to Copper.",
    },
    locationId: {
      label: "Your location number",
      placeholder: "From Square settings",
      helpTitle: "On the Square developer page",
      helpBody:
        "Square shows a location ID for your business. Copy it from the same page as your connection code.",
    },
    dataCenter: {
      label: "Where is your account based?",
      placeholder: "Choose your region",
      helpTitle: "Match your Zoho login",
      helpBody: "Pick the same region as when you sign in to Zoho (US, Europe, Australia, etc.).",
    },
    businessId: pasteField(name, "business number"),
    siteId: pasteField(name, "site number"),
  };

  if (byKey[key]) return byKey[key];

  return {
    label:
      field.label.replace(/\bAPI\b/gi, "").replace(/\btoken\b/gi, "code").trim() || field.label,
    placeholder: field.placeholder.replace(/API/gi, "").trim() || "Paste here",
    helpTitle: field.helpTitle,
    helpBody: field.helpBody ?? PASTE_HINT,
  };
}

export function getGuidedWizardIntro(integration: IntegrationDef): string {
  return `Paste your ${integration.name} credentials below — use the sign-in button if you need to copy them from your account. About 2 minutes.`;
}

export function getPlainStepTitle(
  integration: IntegrationDef,
  fieldIndex: number,
  total: number
): string {
  void integration;
  if (fieldIndex === 0) return "Step 1 — Open settings and copy";
  if (fieldIndex === total - 1) return `Step ${fieldIndex + 1} — Paste and finish`;
  return `Step ${fieldIndex + 1} — Copy the next item`;
}
