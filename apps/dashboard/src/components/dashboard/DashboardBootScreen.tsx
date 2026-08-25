"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

export function DashboardBootScreen() {
  const t = useTranslations("shell");

  return (
    <div className="dashboard-boot-screen">
      <div className="dashboard-boot-glow dashboard-boot-glow--tl" aria-hidden />
      <div className="dashboard-boot-glow dashboard-boot-glow--br" aria-hidden />
      <div className="dashboard-boot-card">
        <Image src="/logo.png" alt="Halla AI" width={200} height={72} className="h-16 w-auto max-w-[180px] object-contain dark:hidden" priority />
        <Image src="/logo-dark.png" alt="Halla AI" width={200} height={72} className="hidden h-16 w-auto max-w-[180px] object-contain dark:block" priority />
        <div className="dashboard-boot-dots" role="status" aria-label={t("loading")}>
          <span className="dashboard-boot-dot" style={{ animationDelay: "0ms" }} />
          <span className="dashboard-boot-dot" style={{ animationDelay: "150ms" }} />
          <span className="dashboard-boot-dot" style={{ animationDelay: "300ms" }} />
        </div>
        <p className="dashboard-boot-label">{t("loadingWorkspace")}</p>
      </div>
    </div>
  );
}
