"use client";

import { useTranslations } from "next-intl";
import { Link2, Zap } from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import type { IntegrationDef } from "@/lib/integration-hub-catalog";
import { navigateToZapierSetup } from "@/lib/zapier-connect";

type Props = {
  integration: IntegrationDef;
  onUseDirectApi: () => void;
};

export function IntegrationZapierEasyPath({ integration, onUseDirectApi }: Props) {
  const t = useTranslations("pages.integrations.hub.easyPath");
  return (
    <div className="space-y-5 max-w-lg">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {t.rich("intro", { name: integration.name, strong: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
      </p>

      <div className="rounded-xl border border-border bg-muted/20 p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Zap className="size-4" strokeWidth={ICON_STROKE} />
          </span>
          <p className="text-sm font-semibold text-foreground">{t("connectViaZapier")}</p>
        </div>

        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>{t("step1")}</li>
          <li>{t("step2", { name: integration.name })}</li>
          <li>{t("step3")}</li>
        </ol>

        <button
          type="button"
          className="btn-primary text-sm w-full inline-flex items-center justify-center gap-2"
          onClick={() => navigateToZapierSetup(integration.id)}
        >
          <Link2 className="size-3.5" strokeWidth={ICON_STROKE} />
          {t("goToZapier")}
        </button>
      </div>

      {!integration.zapierOnly && (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onUseDirectApi}
        >
          {t("advanced")}
        </button>
      )}
    </div>
  );
}
