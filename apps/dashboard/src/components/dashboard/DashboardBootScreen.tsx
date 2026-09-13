"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/** How long to wait before offering a manual way out of the boot screen. */
const STUCK_AFTER_MS = 8_000;

export function DashboardBootScreen() {
  const t = useTranslations("shell");
  const router = useRouter();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="dashboard-boot-screen">
      <div className="dashboard-boot-glow dashboard-boot-glow--tl" aria-hidden />
      <div className="dashboard-boot-glow dashboard-boot-glow--br" aria-hidden />
      <div className="dashboard-boot-card">
        <Image src="/logo-receptionist-nav.jpg" alt="Halla AI — AI Receptionist" width={200} height={200} className="h-16 w-auto max-w-[180px] object-contain rounded-md" priority />
        <div className="dashboard-boot-dots" role="status" aria-label={t("loading")}>
          <span className="dashboard-boot-dot" style={{ animationDelay: "0ms" }} />
          <span className="dashboard-boot-dot" style={{ animationDelay: "150ms" }} />
          <span className="dashboard-boot-dot" style={{ animationDelay: "300ms" }} />
        </div>
        <p className="dashboard-boot-label">{t("loadingWorkspace")}</p>
        {stuck && (
          <div className="dashboard-boot-stuck">
            <p className="dashboard-boot-label">{t("bootTimeout")}</p>
            <button
              type="button"
              className="dashboard-boot-retry-link"
              onClick={() => router.replace("/login")}
            >
              {t("backToSignIn")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
