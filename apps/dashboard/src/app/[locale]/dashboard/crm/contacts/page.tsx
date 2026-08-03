"use client";

import { Contact } from "lucide-react";
import { CrmNotBuilt } from "@/components/dashboard/CrmNotBuilt";

export default function CrmContactsPage() {
  return <CrmNotBuilt icon={Contact} entityName="Contact" entityNamePlural="Contacts" />;
}
