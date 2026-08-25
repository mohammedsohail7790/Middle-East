"use client";

import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Shield, Building2, ChevronRight } from "lucide-react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { TeamAccountPanel } from "@/components/settings/TeamAccountPanel";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

export default function SettingsPage() {
  const t = useTranslations("pages.settings");
  const { title, description } = useDashboardPageLabels("/dashboard/settings");

  return (
    <DashboardPage
      title={title}
      description={description}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 min-w-0"
      >
        <Link
          href="/dashboard/business-profile"
          className="dashboard-panel-padded space-y-1 flex items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
        >
          <SectionHeader
            icon={Building2}
            title={t("businessProfileLink")}
            iconVariant="accent"
            description={t("businessProfileDesc")}
          />
          <ChevronRight className="size-5 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />
        </Link>

        <Link
          href="/dashboard/settings/spam"
          className="dashboard-panel-padded space-y-1 flex items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
        >
          <SectionHeader
            icon={Shield}
            title={t("spamLink")}
            iconVariant="violet"
            description={t("spamDesc")}
          />
          <ChevronRight className="size-5 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />
        </Link>

        <TeamAccountPanel />
      </motion.div>
    </DashboardPage>
  );
}
