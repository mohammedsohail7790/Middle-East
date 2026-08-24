"use client";

import { Building2 } from "lucide-react";
import { CrmEntityManager, type CrmFieldConfig } from "@/components/dashboard/CrmEntityManager";
import { IconBox } from "@/components/ui-kit/IconBox";

const FIELDS: CrmFieldConfig[] = [
  { key: "name", label: "Company name", type: "text", required: true, placeholder: "Acme Corp" },
  { key: "website", label: "Website", type: "url", placeholder: "https://acme.com" },
  { key: "industry", label: "Industry", type: "text", placeholder: "HVAC, Legal, Real Estate..." },
  { key: "notes", label: "Notes", type: "textarea", placeholder: "Anything worth remembering" },
];

export default function CrmCompaniesPage() {
  return (
    <CrmEntityManager
      title="Companies"
      description="Organizations you do business with."
      icon={Building2}
      entityLabel="Company"
      apiPath="/crm/companies"
      fields={FIELDS}
      emptyDescription="Add the organizations you work with to link contacts and deals to them."
      renderRow={(item) => (
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <IconBox icon={Building2} variant="accent" size="md" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{String(item.name ?? "")}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-foreground-tertiary">
              {item.industry ? <span>{String(item.industry)}</span> : null}
              {item.website ? (
                <a
                  href={String(item.website)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-accent hover:underline truncate"
                >
                  {String(item.website)}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      )}
    />
  );
}
