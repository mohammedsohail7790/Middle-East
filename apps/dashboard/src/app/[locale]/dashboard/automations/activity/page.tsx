"use client";

import { DashboardPage } from "@/components/ui-kit/DashboardPage";

/** Placeholder: the activity screen replaces this page (the run log with each step, actions waiting for approval, and the time-saved report). */
export default function AutomationActivityPage() {
  return (
    <DashboardPage title="Automation activity" description="What your automations did, what waits for your yes, and the time saved">
      <p className="text-sm text-muted-foreground">Coming next.</p>
    </DashboardPage>
  );
}
