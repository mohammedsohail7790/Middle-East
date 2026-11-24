"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { CRM_CATALOG, ZAPIER_CATCH_HOOK_INTENT, type CrmCatalogId } from "@/lib/integrations-catalog";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { IntegrationIcon } from "@/components/integrations/IntegrationIcon";

type Props = {
  selectedIds: CrmCatalogId[];
};

export function CrmGuideCards({ selectedIds }: Props) {
  const t = useTranslations("pages.integrations.hub.crmGuide");
  const items = CRM_CATALOG.filter((c) => selectedIds.includes(c.id));

  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      {items.map((crm) => (
        <article key={crm.id} className="dashboard-panel-padded card-hover">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <IntegrationIcon id={crm.id} size="lg" className="shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground">{crm.name}</h4>
              <p className="text-xs text-muted-foreground mt-1">{crm.tagline}</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/50 border border-border p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {t("addAction")}
                  </p>
                  <p className="text-xs text-foreground font-medium">{crm.zapAction}</p>
                </div>
                <div className="rounded-lg bg-muted/50 border border-border p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {t("mapFields")}
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {crm.fieldMap.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <a
                href={ZAPIER_CATCH_HOOK_INTENT}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                {t("openZapierToAdd", { name: crm.name })}
                <ExternalLink className="size-3" strokeWidth={ICON_STROKE} />
              </a>
            </div>
          </div>
        </article>
      ))}

      <p className="text-xs text-muted-foreground px-1">
        {t.rich("tip", { strong: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
      </p>
    </div>
  );
}
