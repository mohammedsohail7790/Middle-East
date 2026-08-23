"use client";

import { cn } from "@/lib/utils";
import { CRM_CATALOG, type CrmCatalogId } from "@/lib/integrations-catalog";
import { Check } from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { IntegrationIcon } from "@/components/integrations/IntegrationIcon";

type Props = {
  selected: CrmCatalogId[];
  onChange: (ids: CrmCatalogId[]) => void;
};

export function CrmInterestPicker({ selected, onChange }: Props) {
  const toggle = (id: CrmCatalogId) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {CRM_CATALOG.map((crm) => {
        const active = selected.includes(crm.id);
        return (
          <button
            key={crm.id}
            type="button"
            onClick={() => toggle(crm.id)}
            className={cn(
              "relative text-left dashboard-panel-padded card-hover min-h-[108px] !p-4 transition-colors duration-200 cursor-pointer",
              active
                ? "ring-2 ring-accent/40 bg-accent/[0.06]"
                : "hover:border-accent/30"
            )}
          >
            {active && (
              <span className="absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-full bg-accent text-white">
                <Check className="size-3" strokeWidth={ICON_STROKE + 0.5} />
              </span>
            )}
            <IntegrationIcon id={crm.id} size="lg" />
            <span className="block text-sm font-semibold text-foreground mt-2 leading-tight">{crm.name}</span>
            <span className="block text-[11px] text-muted-foreground mt-1 line-clamp-2">{crm.tagline}</span>
          </button>
        );
      })}
    </div>
  );
}
