"use client";

import { useTranslations } from "next-intl";
import { CATEGORY_LABELS, type IntegrationCategory, type IntegrationDef } from "@/lib/integration-hub-catalog";

/** Translated category names and one-line descriptions for the integrations hub. Anything without a translation keeps its English text. */
export function useIntegrationText() {
  const t = useTranslations("pages.integrations.hub");
  return {
    categoryLabel: (category: IntegrationCategory): string => (t.has(`categories.${category}` as never) ? t(`categories.${category}` as never) : CATEGORY_LABELS[category]),
    tagline: (integration: IntegrationDef): string => (t.has(`taglines.${integration.id}` as never) ? t(`taglines.${integration.id}` as never) : integration.tagline),
  };
}
