"use client";

import { Calendar, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  getIntegrationOnboardingCallUrl,
  isPayingCustomer,
} from "@/lib/integration-support";

type Props = {
  integrationName: string;
  variant?: "inline" | "prominent";
  /** Show even for trial users (e.g. Zapier hub primary CTA). */
  forceShow?: boolean;
};

export function IntegrationOnboardingCallOffer({
  integrationName,
  variant = "inline",
  forceShow = false,
}: Props) {
  const t = useTranslations("pages.integrations.hub.callOffer");
  if (!forceShow && !isPayingCustomer()) return null;

  const href = getIntegrationOnboardingCallUrl(integrationName);

  if (variant === "prominent") {
    return (
      <div className="rounded-lg border border-accent/25 bg-accent/5 p-4 space-y-2">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Phone className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{t("needHand")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {t.rich("prominentBody", { name: integrationName, strong: (chunks) => <strong>{chunks}</strong> })}
            </p>
          </div>
        </div>
        <a
          href={href}
          target={href.startsWith("mailto:") ? undefined : "_blank"}
          rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
          className="btn-primary text-sm w-full inline-flex items-center justify-center gap-2"
        >
          <Calendar className="size-4" />
          {t("bookFree")}
        </a>
      </div>
    );
  }

  return (
    <p className="text-xs text-muted-foreground text-center">
      {t("stillStuck")}{" "}
      <a
        href={href}
        target={href.startsWith("mailto:") ? undefined : "_blank"}
        rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
        className="text-accent font-medium hover:underline"
      >
        {t("bookLink")}
      </a>{" "}
      {t("weWillConnect", { name: integrationName })}
    </p>
  );
}
