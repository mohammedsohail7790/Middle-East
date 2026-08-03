"use client";

import type { LucideIcon } from "lucide-react";
import { Hammer } from "lucide-react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { EmptyState } from "@/components/ui-kit/EmptyState";

export function CrmNotBuilt({
  icon: Icon,
  entityName,
  entityNamePlural,
}: {
  icon: LucideIcon;
  entityName: string;
  entityNamePlural: string;
}) {
  return (
    <DashboardPage
      title={entityNamePlural}
      description={`Manage your ${entityNamePlural.toLowerCase()} in one place.`}
    >
      <EmptyState
        icon={Icon}
        title={`No ${entityNamePlural.toLowerCase()} yet`}
        description={`${entityName} management is being built. The database is ready — this page will let you create and manage ${entityNamePlural.toLowerCase()} once it ships.`}
        action={
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Hammer className="size-4" />
            Coming in a future update
          </span>
        }
      />
    </DashboardPage>
  );
}
