"use client";

import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { LeadsPipeline } from "@/components/consultancy/leads/LeadsPipeline";

/** The team's prospect pipeline: fit checks and call requests, and where each one is in the audit. */
export default function Page() {
  return (
    <DashboardPage title="Prospects" description="Fit checks and audits in progress">
      <LeadsPipeline />
    </DashboardPage>
  );
}
