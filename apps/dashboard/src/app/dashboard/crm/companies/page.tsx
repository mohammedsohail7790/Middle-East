"use client";

import { Building2 } from "lucide-react";
import { CrmNotBuilt } from "@/components/dashboard/CrmNotBuilt";

export default function CrmCompaniesPage() {
  return <CrmNotBuilt icon={Building2} entityName="Company" entityNamePlural="Companies" />;
}
