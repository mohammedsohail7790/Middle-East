"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardTabs } from "@/components/ui-kit/DashboardTabs";
import { automationsApi } from "./client";
import { ApprovalsTab } from "./ApprovalsTab";
import { RunsTab } from "./RunsTab";
import { StatsTab } from "./StatsTab";
import type { AutomationApproval, LibraryTemplate } from "./types";

type TabId = "waiting" | "happened" | "saved";

export function AutomationActivity() {
  const t = useTranslations("pages.automations.activity");
  const tc = useTranslations("pages.automations.common");
  const [tab, setTab] = useState<TabId>("waiting");
  const [approvals, setApprovals] = useState<AutomationApproval[] | null>(null);
  const [approvalsError, setApprovalsError] = useState(false);
  const [library, setLibrary] = useState<LibraryTemplate[]>([]);

  const loadApprovals = useCallback(async () => {
    try {
      setApprovals(await automationsApi.approvals("pending"));
      setApprovalsError(false);
    } catch {
      setApprovals((cur) => cur ?? []);
      setApprovalsError(true);
    }
  }, []);

  useEffect(() => {
    void loadApprovals();
    // Names and step titles come from the library; the screen still works without them.
    automationsApi.library().then(setLibrary).catch(() => setLibrary([]));
  }, [loadApprovals]);

  return (
    <DashboardPage
      title={t("title")}
      description={t("description")}
      actions={<Link href="/dashboard/automations" className="inline-flex h-10 items-center rounded-full border-[1.5px] border-border px-4 text-sm font-medium hover:bg-muted">{t("backToLibrary")}</Link>}
      toolbar={
        <DashboardTabs
          activeId={tab}
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            { id: "waiting", label: t("tabWaiting"), count: approvals?.length ?? 0 },
            { id: "happened", label: t("tabHappened") },
            { id: "saved", label: t("tabSaved") },
          ]}
        />
      }
    >
      {tab === "waiting" && (
        approvals === null ? <div aria-busy="true" className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}</div> : (
          <>
            {approvalsError && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{tc("loadError")} <button type="button" className="font-medium underline" onClick={() => void loadApprovals()}>{tc("tryAgain")}</button></p>}
            <ApprovalsTab approvals={approvals} onRefresh={loadApprovals} />
          </>
        )
      )}
      {tab === "happened" && <RunsTab library={library} />}
      {tab === "saved" && <StatsTab />}
    </DashboardPage>
  );
}
