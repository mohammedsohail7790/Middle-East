"use client";

import { Contact, Mail, Phone } from "lucide-react";
import { CrmEntityManager, type CrmFieldConfig, type CrmRelationOption } from "@/components/dashboard/CrmEntityManager";
import { IconBox } from "@/components/ui-kit/IconBox";
import { formatPhone } from "@/lib/utils";

const RELATIONS: CrmRelationOption[] = [
  { key: "companyId", label: "Company", apiPath: "/crm/companies", labelField: "name" },
];

const FIELDS: CrmFieldConfig[] = [
  { key: "name", label: "Name", type: "text", required: true, placeholder: "Jane Doe" },
  { key: "companyId", label: "Company", type: "relation" },
  { key: "phone", label: "Phone", type: "tel", placeholder: "+1 (555) 000-0000" },
  { key: "email", label: "Email", type: "email", placeholder: "jane@example.com" },
  { key: "notes", label: "Notes", type: "textarea", placeholder: "Anything worth remembering" },
];

export default function CrmContactsPage() {
  return (
    <CrmEntityManager
      title="Contacts"
      description="People associated with your business."
      icon={Contact}
      entityLabel="Contact"
      apiPath="/crm/contacts"
      fields={FIELDS}
      relations={RELATIONS}
      emptyDescription="Add the people you're in touch with — customers, prospects, or partners."
      renderRow={(item, relationOptions) => {
        const company = relationOptions.companyId?.find((c) => c.id === item.companyId);
        return (
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <IconBox icon={Contact} variant="accent" size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{String(item.name ?? "")}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-foreground-tertiary">
                {company ? <span className="truncate">{String(company.name)}</span> : null}
                {item.phone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3" /> {formatPhone(String(item.phone))}
                  </span>
                ) : null}
                {item.email ? (
                  <span className="inline-flex items-center gap-1 truncate">
                    <Mail className="size-3" /> {String(item.email)}
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
