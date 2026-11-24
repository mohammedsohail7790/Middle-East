"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ExternalLink,
  Loader2,
  CheckCircle2,
  Copy,
  ChevronDown,
  Link2,
} from "lucide-react";
import { api } from "@/lib/api";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { showDashboardToast } from "@/lib/dashboard-toast";
import { ZAPIER_CATCH_HOOK_INTENT, ZAPIER_SETUP_SCREENSHOTS } from "@/lib/integrations-catalog";
import { cn } from "@/lib/utils";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { IntegrationSetupMedia } from "@/components/integrations/IntegrationSetupMedia";

type Props = {
  connected: boolean;
  onConnectedChange: (v: boolean) => void;
};

export function ZapierHubSection({ connected, onConnectedChange }: Props) {
  const t = useTranslations("pages.integrations.hub.zapier");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void api
      .get<{ webhookUrl?: string | null }>("/integrations/zapier/status")
      .then((data) => {
        if (!cancelled && data?.webhookUrl) setWebhookUrl(data.webhookUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const save = async () => {
    const url = webhookUrl.trim();
    if (!url.startsWith("https://hooks.zapier.com/")) {
      showDashboardToast({
        type: "error",
        title: t("invalidTitle"),
        message: t("invalidBody"),
      });
      return;
    }
    setSaving(true);
    try {
      await api.post("/integrations/zapier/configure", { webhookUrl: url });
      onConnectedChange(true);
      syncDashboardAction("integrations");
      showDashboardToast({
        type: "success",
        title: t("connectedTitle"),
        message: t("connectedBody"),
      });
    } catch (e) {
      showDashboardToast({
        type: "error",
        title: t("saveFailedTitle"),
        message: e instanceof Error ? e.message : t("saveFailed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      if (!connected && webhookUrl.trim()) {
        await api.post("/integrations/zapier/configure", { webhookUrl: webhookUrl.trim() });
        onConnectedChange(true);
      }
      const data = await api.post<{ success: boolean; message: string }>("/integrations/zapier/test", {});
      if (!data.success) {
        showDashboardToast({
          type: "warning",
          title: t("testAttentionTitle"),
          message: data.message || t("testAttentionBody"),
        });
      } else {
        showDashboardToast({
          type: "success",
          title: t("testSentTitle"),
          message: data.message || t("testSentBody"),
        });
      }
      syncDashboardAction("integrations");
    } catch (e) {
      showDashboardToast({
        type: "error",
        title: t("testFailedTitle"),
        message: e instanceof Error ? e.message : t("testFailed"),
      });
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);
    try {
      await api.del("/integrations/zapier/disconnect");
      onConnectedChange(false);
      setWebhookUrl("");
      syncDashboardAction("integrations");
    } catch (e) {
      showDashboardToast({
        type: "error",
        title: t("disconnectFailedTitle"),
        message: e instanceof Error ? e.message : t("disconnectFailed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const copyClientInstructions = () => {
    const text = `Connect your app to Halla AI via Zapier:
1. In Zapier, create a Zap with Webhooks by Zapier → Catch Hook as the trigger
2. Add your CRM or app as the action step
3. Turn the Zap ON and copy the Catch Hook URL
4. In Halla AI: Dashboard → Integrations → Zapier → paste the URL and save
5. Click Send test lead to verify`;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dashboard-panel overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:divide-x divide-border">
        <div className="flex-1 p-4 sm:p-6 space-y-4 border-b lg:border-b-0 border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t("webhookConfig")}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-md">
                {t("webhookConfigDesc")}
              </p>
            </div>
            {connected ? (
              <span className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-full px-3 py-1">
                <CheckCircle2 className="size-3.5" strokeWidth={ICON_STROKE} />
                {t("connected")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-full px-3 py-1">
                <Link2 className="size-3.5" strokeWidth={ICON_STROKE} />
                {t("notConnected")}
              </span>
            )}
          </div>

          <a
            href={ZAPIER_CATCH_HOOK_INTENT}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-sm inline-flex items-center gap-2 border border-border w-full sm:w-auto justify-center"
          >
            {t("openZapier")}
            <ExternalLink className="size-3.5" strokeWidth={ICON_STROKE} />
          </a>

          <div className="space-y-2">
            <label htmlFor="zapier-webhook-url" className="text-xs font-medium text-foreground">
              {t("catchHookUrl")}
            </label>
            <input
              id="zapier-webhook-url"
              type="url"
              className="input w-full text-sm font-mono"
              placeholder="https://hooks.zapier.com/hooks/catch/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <button
              type="button"
              className="tap-target text-xs text-accent font-medium hover:underline"
              onClick={() => setShowGuide((v) => !v)}
            >
              {showGuide ? t("hideGuide") : t("showGuide")}
            </button>
            {showGuide && (
              <IntegrationSetupMedia
                screenshots={ZAPIER_SETUP_SCREENSHOTS}
                helpSteps={[t("helpStep1"), t("helpStep2"), t("helpStep3"), t("helpStep4")]}
                activeStepIndex={0}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={saving || !webhookUrl.trim()}
              onClick={() => void save()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={ICON_STROKE} />
              ) : (
                t("saveWebhook")
              )}
            </button>
            <button
              type="button"
              className="btn-ghost text-sm inline-flex items-center gap-2 border border-border"
              disabled={testing || !webhookUrl.trim()}
              onClick={() => void test()}
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={ICON_STROKE} />
              ) : (
                t("sendTest")
              )}
            </button>
            {connected && (
              <button
                type="button"
                className="btn-ghost text-sm text-red-600"
                disabled={saving}
                onClick={() => void disconnect()}
              >
                {t("disconnect")}
              </button>
            )}
          </div>
        </div>

        <div className="lg:w-72 xl:w-80 p-4 sm:p-6 bg-muted/15 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("supportedVia")}
          </p>
          <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <li>Insightly, Follow Up Boss, Copper (API)</li>
            <li>Buildium, AppFolio, Yardi</li>
            <li>{t("supportedMore")}</li>
          </ul>
          <details
            className="rounded-lg border border-border text-xs bg-background/60"
            open={showHelp}
            onToggle={(e) => setShowHelp((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer px-3 py-2.5 font-medium text-foreground flex items-center gap-1.5">
              <ChevronDown className={cn("size-3.5 transition-transform", showHelp && "rotate-180")} />
              {t("clientHandoff")}
            </summary>
            <div className="px-3 pb-3 border-t border-border pt-2">
              <button
                type="button"
                className="text-accent font-medium hover:underline inline-flex items-center gap-1"
                onClick={copyClientInstructions}
              >
                <Copy className="size-3" strokeWidth={ICON_STROKE} />
                {copied ? t("copied") : t("copySteps")}
              </button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
