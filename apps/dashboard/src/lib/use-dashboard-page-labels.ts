"use client";

import { useTranslations } from "next-intl";
import { navItemByPath } from "@/lib/dashboard-nav";

/** Resolve translated page title + subtitle from dashboard nav keys or pages.* fallback. */
export function useDashboardPageLabels(pathname: string) {
  const t = useTranslations();

  if (pathname?.match(/\/dashboard\/calls\/[^/]+/)) {
    return {
      title: t("pages.callDetail.title"),
      description: t("pages.callDetail.description"),
    };
  }

  if (pathname?.startsWith("/dashboard/settings") && !pathname.includes("/spam")) {
    return {
      title: t("pages.settings.title"),
      description: t("pages.settings.description"),
    };
  }

  if (pathname?.startsWith("/dashboard/integrations/setup")) {
    return {
      title: t("pages.integrationsSetup.title"),
      description: t("pages.integrationsSetup.description"),
    };
  }

  const item = navItemByPath(pathname);
  if (item) {
    return {
      title: t(item.labelKey),
      description: item.subtitleKey ? t(item.subtitleKey) : undefined,
    };
  }

  return { title: t("nav.dashboard"), description: undefined };
}
