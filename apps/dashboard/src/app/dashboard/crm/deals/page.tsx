"use client";

import { Briefcase } from "lucide-react";
import { CrmNotBuilt } from "@/components/dashboard/CrmNotBuilt";

export default function CrmDealsPage() {
  return <CrmNotBuilt icon={Briefcase} entityName="Deal" entityNamePlural="Deals" />;
}
