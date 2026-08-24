"use client";

import { Briefcase } from "lucide-react";
import { CrmEntityManager, type CrmFieldConfig, type CrmRelationOption } from "@/components/dashboard/CrmEntityManager";
import { IconBox } from "@/components/ui-kit/IconBox";

const RELATIONS: CrmRelationOption[] = [
  { key: "companyId", label: "Company", apiPath: "/crm/companies", labelField: "name" },
  { key: "contactId", label: "Contact", apiPath: "/crm/contacts", labelField: "name" },
  { key: "stageId", label: "Stage", apiPath: "/crm/stages", labelField: "name" },
];

const FIELDS: CrmFieldConfig[] = [
  { key: "title", label: "Deal title", type: "text", required: true, placeholder: "Annual support contract" },
  { key: "companyId", label: "Company", type: "relation" },
  { key: "contactId", label: "Contact", type: "relation" },
  { key: "stageId", label: "Stage", type: "relation" },
  { key: "value", label: "Value", type: "number", placeholder: "5000" },
  { key: "currency", label: "Currency", type: "text", placeholder: "USD" },
  { key: "notes", label: "Notes", type: "textarea", placeholder: "Anything worth remembering" },
];

function dealMoneyLabel(value: unknown, currency: unknown): string {
  const amount = Number(value ?? 0);
  const code = typeof currency === "string" && currency ? currency : "USD";
  try {
    const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: code });
    return formatter.format(amount);
  } catch {
    return `${amount} ${code}`;
  }
}

export default function CrmDealsPage() {
  return (
    <CrmEntityManager
      title="Deals"
      description="Open and closed opportunities."
      icon={Briefcase}
      entityLabel="Deal"
      apiPath="/crm/deals"
      fields={FIELDS}
      relations={RELATIONS}
      emptyDescription="Track opportunities from first conversation through close."
      renderRow={(item, relationOptions) => {
        const company = relationOptions.companyId?.find((c) => c.id === item.companyId);
        const stage = relationOptions.stageId?.find((s) => s.id === item.stageId);
        return (
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <IconBox icon={Briefcase} variant="accent" size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{String(item.title ?? "")}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-foreground-tertiary">
                <span className="font-medium text-foreground-secondary">
                  {dealMoneyLabel(item.value, item.currency)}
                </span>
                {company ? <span className="truncate">{String(company.name)}</span> : null}
                {stage ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-muted text-foreground-secondary">
                    {String(stage.name)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
