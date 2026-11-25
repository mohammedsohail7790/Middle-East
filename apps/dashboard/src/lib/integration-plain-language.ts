import type { IntegrationDef, IntegrationField } from "@/lib/integration-hub-catalog";
import en from "@/messages/en.json";

type PlainCopy = {
  label: string;
  placeholder: string;
  helpTitle?: string;
  helpBody?: string;
};

/**
 * Translator for the "pages.integrations.hub.plain" messages (what next-intl's useTranslations gives).
 * Without one, the English wording is used, so callers outside the wizard behave as before.
 */
export type PlainTranslator = (key: string, values?: Record<string, string | number>) => string;

const ENGLISH = en.pages.integrations.hub.plain as Record<string, string>;

function say(t: PlainTranslator | undefined, key: string, values?: Record<string, string | number>): string {
  if (t) return t(key, values);
  return ENGLISH[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
}

function pasteField(t: PlainTranslator | undefined, integrationName: string, what: string): PlainCopy {
  return {
    label: say(t, "pasteLabel", { what: say(t, `what_${what}`) }),
    placeholder: say(t, "pasteHere"),
    helpTitle: say(t, "whereToFind", { name: integrationName }),
    helpBody: say(t, "hint"),
  };
}

/** Plain-English labels — clients never need to know what an API key is. */
export function getPlainCredentialCopy(
  integration: IntegrationDef,
  field: IntegrationField,
  t?: PlainTranslator
): PlainCopy {
  const name = integration.name;
  const key = field.key;
  const s = (k: string, values?: Record<string, string | number>) => say(t, k, values);

  const byKey: Record<string, PlainCopy> = {
    apiKey:
      integration.id === "copper"
        ? {
            label: s("copperKeyLabel"),
            placeholder: s("copperKeyPlaceholder"),
            helpTitle: s("copperKeyHelpTitle"),
            helpBody: s("copperKeyHelpBody"),
          }
        : pasteField(t, name, "connectionCode"),
    apiToken: pasteField(t, name, "connectionCode"),
    accessToken: pasteField(t, name, "connectionCode"),
    clientSecret: pasteField(t, name, "secretCode"),
    refreshToken: pasteField(t, name, "longCode"),
    webhookUrl: {
      label: s("zapierLabel"),
      placeholder: s("zapierPlaceholder"),
      helpTitle: s("zapierHelpTitle"),
      helpBody: s("zapierHelpBody"),
    },
    domain:
      integration.id === "freshsales"
        ? {
            label: s("freshLabel"),
            placeholder: s("freshPlaceholder"),
            helpTitle: s("freshHelpTitle", { name }),
            helpBody: s("freshHelpBody"),
          }
        : {
            label: s("domainLabel"),
            placeholder: s("domainPlaceholder"),
            helpTitle: s("domainHelpTitle", { name }),
            helpBody: s("domainHelpBody", { name }),
          },
    apiDomain:
      integration.id === "yardi"
        ? {
            label: s("yardiLabel"),
            placeholder: s("yardiPlaceholder"),
            helpTitle: s("yardiHelpTitle"),
            helpBody: s("yardiHelpBody"),
          }
        : {
            label: s("domainLabel"),
            placeholder: s("domainPlaceholder"),
            helpTitle: s("domainHelpTitle", { name }),
            helpBody: s("apiDomainHelpBody", { name }),
          },
    userId: {
      label: s("userIdLabel"),
      placeholder: s("userIdPlaceholder"),
      helpTitle: s("userIdHelpTitle"),
      helpBody: s("userIdHelpBody"),
    },
    companyId: {
      label: s("companyIdLabel"),
      placeholder: s("companyIdPlaceholder"),
      helpTitle: s("companyIdHelpTitle"),
      helpBody: s("companyIdHelpBody"),
    },
    tenantId: {
      label: s("tenantIdLabel"),
      placeholder: s("tenantIdPlaceholder"),
      helpTitle: s("tenantIdHelpTitle"),
      helpBody: s("tenantIdHelpBody"),
    },
    appKey: pasteField(t, name, "appCode"),
    clientId: {
      label: s("clientIdLabel"),
      placeholder: s("clientIdPlaceholder"),
      helpTitle: s("clientIdHelpTitle", { name }),
      helpBody: s("hint"),
    },
    userEmail: {
      label: s("userEmailLabel"),
      placeholder: s("userEmailPlaceholder"),
      helpTitle: s("userEmailHelpTitle"),
      helpBody: s("userEmailHelpBody"),
    },
    locationId: {
      label: s("locationIdLabel"),
      placeholder: s("locationIdPlaceholder"),
      helpTitle: s("locationIdHelpTitle"),
      helpBody: s("locationIdHelpBody"),
    },
    dataCenter: {
      label: s("dataCenterLabel"),
      placeholder: s("dataCenterPlaceholder"),
      helpTitle: s("dataCenterHelpTitle"),
      helpBody: s("dataCenterHelpBody"),
    },
    businessId: pasteField(t, name, "businessNumber"),
    siteId: pasteField(t, name, "siteNumber"),
  };

  if (byKey[key]) return byKey[key];

  return {
    label:
      field.label.replace(/\bAPI\b/gi, "").replace(/\btoken\b/gi, "code").trim() || field.label,
    placeholder: field.placeholder.replace(/API/gi, "").trim() || s("pasteHere"),
    helpTitle: field.helpTitle,
    helpBody: field.helpBody ?? s("hint"),
  };
}

export function getGuidedWizardIntro(integration: IntegrationDef, t?: PlainTranslator): string {
  return say(t, "wizardIntro", { name: integration.name });
}

export function getPlainStepTitle(
  integration: IntegrationDef,
  fieldIndex: number,
  total: number,
  t?: PlainTranslator
): string {
  void integration;
  if (fieldIndex === 0) return say(t, "stepFirst");
  if (fieldIndex === total - 1) return say(t, "stepLast", { n: fieldIndex + 1 });
  return say(t, "stepMiddle", { n: fieldIndex + 1 });
}
