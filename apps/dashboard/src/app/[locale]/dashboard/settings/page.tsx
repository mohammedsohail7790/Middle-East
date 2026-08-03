"use client";

import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { Shield, ChevronRight } from "lucide-react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { TeamAccountPanel } from "@/components/settings/TeamAccountPanel";

export default function SettingsPage() {
  return (
    <DashboardPage
      title="Team & Account"
      description="Manage teammates and access. Company info lives on Business Profile; call handling lives on AI Agent."
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 min-w-0"
      >
        <Link
          href="/dashboard/settings/spam"
          className="dashboard-panel-padded space-y-1 flex items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
        >
          <SectionHeader
            icon={Shield}
            title="Spam protection"
            iconVariant="violet"
            description="Block robocalls and unwanted callers before they reach your AI."
          />
          <ChevronRight className="size-5 text-muted-foreground shrink-0" strokeWidth={ICON_STROKE} />
        </Link>

        <TeamAccountPanel />
      </motion.div>
    </DashboardPage>
  );
}
