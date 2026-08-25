"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Shield, Building2 } from "lucide-react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { SettingsNavCard } from "@/components/settings/SettingsNavCard";
import { TeamAccountPanel } from "@/components/settings/TeamAccountPanel";
import { VibePanel } from "@/components/magic-ui/vibe-panel";
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
        <SettingsNavCard
          href="/dashboard/business-profile"
          icon={Building2}
          title={t("businessProfileLink")}
          description={t("businessProfileDesc")}
          iconVariant="accent"
        />

        <SettingsNavCard
          href="/dashboard/settings/spam"
          icon={Shield}
          title={t("spamLink")}
          description={t("spamDesc")}
          iconVariant="violet"
        />

        <VibePanel beam className="rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="p-1 sm:p-2">
            <TeamAccountPanel />
          </div>
        </VibePanel>
      </motion.div>
    </DashboardPage>
  );
}
