"use client";

import { useTranslations } from "next-intl";
import { CATEGORY_LABELS, type IntegrationCategory, type IntegrationDef } from "@/lib/integration-hub-catalog";

/** Translated category names and one-line descriptions for the integrations hub. Anything without a translation keeps its English text. */
export function useIntegrationText() {
  const t = useTranslations("pages.integrations.hub");
  return {
    categoryLabel: (category: IntegrationCategory): string => (t.has(`categories.${category}` as never) ? t(`categories.${category}` as never) : CATEGORY_LABELS[category]),
    tagline: (integration: IntegrationDef): string => (t.has(`taglines.${integration.id}` as never) ? t(`taglines.${integration.id}` as never) : integration.tagline),
    /** The numbered setup steps. Falls back to the English steps if a translation is missing or has a different number of steps. */
    helpSteps: (integration: IntegrationDef): string[] | undefined => {
      const english = integration.helpSteps;
      if (!english) return english;
      const keys = english.map((_, i) => `providers.${integration.id}.step${i + 1}`);
      return keys.every((k) => t.has(k as never)) ? keys.map((k) => t(k as never)) : english;
    },
    /** Label of the "connect another way" button (Zoho's refresh-token option). */
    alternateLabel: (integration: IntegrationDef): string | undefined =>
      integration.alternateCredentialLabel && t.has(`providers.${integration.id}.alternateLabel` as never)
        ? t(`providers.${integration.id}.alternateLabel` as never)
        : integration.alternateCredentialLabel,
    /** Name of a Zoho data center in a select list, by its value ("com.au" becomes "comAu"). */
    regionLabel: (value: string, english: string): string => {
      const key = `regions.${value.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase())}`;
      return t.has(key as never) ? t(key as never) : english;
    },
  };
}
