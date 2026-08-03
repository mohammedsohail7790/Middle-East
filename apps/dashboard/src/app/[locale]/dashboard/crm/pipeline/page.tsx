"use client";

import { KanbanSquare } from "lucide-react";
import { CrmNotBuilt } from "@/components/dashboard/CrmNotBuilt";

export default function CrmPipelinePage() {
  return <CrmNotBuilt icon={KanbanSquare} entityName="Pipeline stage" entityNamePlural="Pipeline" />;
}
