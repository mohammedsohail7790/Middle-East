"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Save, Shield, ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { showDashboardToast } from "@/lib/dashboard-toast";

interface SpamSettings {
  enabled: boolean;
  blockUnknownCaller: boolean;
  stirShakenRequired: boolean;
  customBlocklist: string[];
  customAllowlist: string[];
}

export default function SpamSettingsPage() {
  const t = useTranslations("pages.spam");
  const tCommon = useTranslations("common");
  const [spamSettings, setSpamSettings] = useState<SpamSettings | null>(null);
  const [blocklistText, setBlocklistText] = useState("");
  const [allowlistText, setAllowlistText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const spam = await api.get<SpamSettings>("/spam/settings");
      setSpamSettings(spam);
      setBlocklistText((spam.customBlocklist || []).join("\n"));
      setAllowlistText((spam.customAllowlist || []).join("\n"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load spam settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!spamSettings) return;
    setSaving(true);
    try {
      const updated = await api.put<SpamSettings>("/spam/settings", {
        enabled: spamSettings.enabled,
        blockUnknownCaller: spamSettings.blockUnknownCaller,
        stirShakenRequired: spamSettings.stirShakenRequired,
        customBlocklist: blocklistText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        customAllowlist: allowlistText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setSpamSettings(updated);
      showDashboardToast({ type: "success", title: t("saved") });
    } catch (e) {
      showDashboardToast({
        type: "error",
        title: t("saveFailed"),
        message: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardPage
      title={t("title")}
      description={t("description")}
      loading={loading && !spamSettings}
      error={!spamSettings && !loading ? error || "Failed to load spam settings" : undefined}
      toolbar={
        <Link href="/dashboard/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" strokeWidth={ICON_STROKE} /> {t("backToSettings")}
        </Link>
      }
      actions={
        spamSettings ? (
          <button onClick={() => void save()} disabled={saving} className="btn-primary w-full sm:w-auto justify-center">
            <Save className="size-4" strokeWidth={ICON_STROKE} /> {saving ? tCommon("saving") : tCommon("save")}
          </button>
        ) : undefined
      }
    >
      {spamSettings && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-panel-padded space-y-6 max-w-2xl"
        >
          <SectionHeader icon={Shield} title={t("sectionTitle")} iconVariant="violet" />
          <div className="space-y-2">
            <label
              className="toggle-row"
              onClick={() => setSpamSettings((s) => (s ? { ...s, enabled: !s.enabled } : s))}
            >
              <div className="toggle-row-text">
                <span className="toggle-row-label">{t("enableFiltering")}</span>
                <span className="toggle-row-hint">{t("enableFilteringHint")}</span>
              </div>
              <label className="toggle" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={spamSettings.enabled}
                  onChange={(e) => setSpamSettings((s) => (s ? { ...s, enabled: e.target.checked } : s))}
                />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
              </label>
            </label>
            <label
              className="toggle-row"
              onClick={() => setSpamSettings((s) => (s ? { ...s, blockUnknownCaller: !s.blockUnknownCaller } : s))}
            >
              <div className="toggle-row-text">
                <span className="toggle-row-label">{t("blockAnonymous")}</span>
                <span className="toggle-row-hint">{t("blockAnonymousHint")}</span>
              </div>
              <label className="toggle" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={spamSettings.blockUnknownCaller}
                  onChange={(e) => setSpamSettings((s) => (s ? { ...s, blockUnknownCaller: e.target.checked } : s))}
                />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
              </label>
            </label>
            <label
              className="toggle-row"
              onClick={() => setSpamSettings((s) => (s ? { ...s, stirShakenRequired: !s.stirShakenRequired } : s))}
            >
              <div className="toggle-row-text">
                <span className="toggle-row-label">{t("stirShaken")}</span>
                <span className="toggle-row-hint">{t("stirShakenHint")}</span>
              </div>
              <label className="toggle" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={spamSettings.stirShakenRequired}
                  onChange={(e) => setSpamSettings((s) => (s ? { ...s, stirShakenRequired: e.target.checked } : s))}
                />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
              </label>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="dashboard-field-label">{t("blocklist")}</label>
                <textarea
                  rows={5}
                  value={blocklistText}
                  onChange={(e) => setBlocklistText(e.target.value)}
                  placeholder="+15551234567"
                  className="input resize-none font-mono text-xs"
                />
              </div>
              <div>
                <label className="dashboard-field-label">{t("allowlist")}</label>
                <textarea
                  rows={5}
                  value={allowlistText}
                  onChange={(e) => setAllowlistText(e.target.value)}
                  placeholder="+15559876543"
                  className="input resize-none font-mono text-xs"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="btn-primary text-sm"
            >
              {saving ? tCommon("saving") : t("saveSpam")}
            </button>
          </div>
        </motion.div>
      )}
    </DashboardPage>
  );
}
