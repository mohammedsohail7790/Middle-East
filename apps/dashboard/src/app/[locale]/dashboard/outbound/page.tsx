"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  PhoneOutgoing, Plus, X, Play, Megaphone, Bell, RotateCcw, Phone,
} from "lucide-react";
import { IconBox, ICON_STROKE, type IconBoxVariant } from "@/components/ui-kit/IconBox";
import { StatCard } from "@/components/ui-kit/StatCard";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { api, asArray } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DASHBOARD_POLL_MS } from "@/lib/dashboard-sync";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { PlanFeatureGate } from "@/components/billing/PlanFeatureGate";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

type CampaignPurpose = "campaign" | "reminder" | "follow_up";
type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: CampaignStatus;
  total_targets: number;
  completed_count: number;
  success_count: number;
  failed_count: number;
  created_at: string;
  purpose: CampaignPurpose | null;
}

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft: "bg-muted text-foreground-secondary",
  scheduled: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  running: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  paused: "bg-muted text-foreground-secondary",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  cancelled: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

export default function OutboundPage() {
  return (
    <PlanFeatureGate feature="outbound">
      <OutboundPageContent />
    </PlanFeatureGate>
  );
}

function OutboundPageContent() {
  const t = useTranslations("pages.outbound");
  const tCommon = useTranslations("common");
  const { title, description } = useDashboardPageLabels("/dashboard/outbound");

  const PURPOSE_META = useMemo(
    (): Record<CampaignPurpose, { label: string; icon: typeof Megaphone; variant: IconBoxVariant }> => ({
      campaign: { label: t("purposeSalesShort"), icon: Megaphone, variant: "accent" },
      reminder: { label: t("purposeReminderShort"), icon: Bell, variant: "warning" },
      follow_up: { label: t("purposeFollowUpShort"), icon: RotateCcw, variant: "violet" },
    }),
    [t]
  );
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCallModal, setShowCallModal] = useState(false);
  const [callNumber, setCallNumber] = useState("");
  const [callContext, setCallContext] = useState("");
  const [callSubmitting, setCallSubmitting] = useState(false);
  const [callResult, setCallResult] = useState("");

  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignPurpose, setCampaignPurpose] = useState<CampaignPurpose>("campaign");
  const [campaignTargets, setCampaignTargets] = useState("");
  const [campaignSubmitting, setCampaignSubmitting] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);

  const loadCampaigns = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    api
      .get<Campaign[]>("/campaigns")
      .then((data) => setCampaigns(asArray(data)))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, []);

  useRealtimeQuery(["calls"], loadCampaigns, "", {
    pollMs: DASHBOARD_POLL_MS,
    pollOnlyWhenDisconnected: true,
  });

  const placeCall = async () => {
    if (!callNumber.trim()) return;
    setCallSubmitting(true);
    setCallResult("");
    try {
      const res = await api.post<{ success: boolean; callSid: string }>("/calls/outbound", {
        toNumber: callNumber.trim(),
        reason: "click_to_call",
        openingContext: callContext.trim() || undefined,
      });
      setCallResult(t("callingNow", { callSid: res.callSid }));
      setCallNumber("");
      setCallContext("");
    } catch (e: unknown) {
      setCallResult(e instanceof Error ? e.message : "Failed to place call");
    } finally {
      setCallSubmitting(false);
    }
  };

  const createCampaign = async () => {
    const numbers = campaignTargets
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!campaignName.trim() || numbers.length === 0) return;
    setCampaignSubmitting(true);
    setError("");
    try {
      await api.post("/campaigns", {
        name: campaignName.trim(),
        purpose: campaignPurpose,
        targets: numbers.map((phoneNumber) => ({ phoneNumber })),
      });
      setShowCampaignModal(false);
      setCampaignName("");
      setCampaignTargets("");
      setCampaignPurpose("campaign");
      loadCampaigns({ silent: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setCampaignSubmitting(false);
    }
  };

  const startCampaign = async (id: string) => {
    setStartingId(id);
    try {
      await api.post(`/campaigns/${id}/start`, {});
      loadCampaigns({ silent: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start campaign");
    } finally {
      setStartingId(null);
    }
  };

  const totalCampaigns = campaigns.length;
  const running = campaigns.filter((c) => c.status === "running").length;
  const totalCalls = campaigns.reduce((sum, c) => sum + (c.total_targets || 0), 0);
  const totalCompleted = campaigns.reduce((sum, c) => sum + (c.completed_count || 0), 0);

  return (
    <DashboardPage
      title={title}
      description={description}
      loading={loading && campaigns.length === 0}
      error={error || undefined}
      actions={
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={() => setShowCallModal(true)} className="btn-ghost flex-1 sm:flex-none justify-center">
            <Phone className="size-4" strokeWidth={ICON_STROKE} /> {t("callNow")}
          </button>
          <button onClick={() => setShowCampaignModal(true)} className="btn-primary flex-1 sm:flex-none justify-center">
            <Plus className="size-4" strokeWidth={ICON_STROKE} /> {t("newCampaign")}
          </button>
        </div>
      }
    >
      <div className="dashboard-stat-grid">
        <StatCard label={t("campaigns")} value={totalCampaigns} icon={Megaphone} iconVariant="accent" index={0} />
        <StatCard label={t("running")} value={running} icon={Play} iconVariant="success" index={1} />
        <StatCard label={t("totalTargets")} value={totalCalls} icon={PhoneOutgoing} iconVariant="violet" index={2} />
        <StatCard label={t("dialed")} value={totalCompleted} icon={Phone} iconVariant="warning" index={3} />
      </div>

      <DashboardPageSection
        step={t("stepOutbound")}
        title={t("campaigns")}
        description={t("sectionDesc")}
        icon={PhoneOutgoing}
        iconVariant="accent"
      >
        {campaigns.length === 0 ? (
          <EmptyState
            icon={PhoneOutgoing}
            title={t("noCampaigns")}
            description={t("noCampaignsDesc")}
          />
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => {
              const meta = PURPOSE_META[c.purpose ?? "campaign"];
              return (
                <div key={c.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 flex-wrap">
                  <IconBox icon={meta.icon} variant={meta.variant} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <span className={cn("px-2 py-0.5 text-[10px] rounded-full font-medium capitalize", STATUS_BADGE[c.status])}>
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("progress", {
                        completed: c.completed_count,
                        total: c.total_targets,
                        success: c.success_count,
                        failed: c.failed_count,
                      })}
                    </p>
                  </div>
                  {(c.status === "draft" || c.status === "paused") && (
                    <button
                      type="button"
                      onClick={() => startCampaign(c.id)}
                      disabled={startingId === c.id}
                      className="btn-ghost !py-1.5 !px-3 text-sm"
                    >
                      {startingId === c.id ? t("starting") : (
                        <>
                          <Play className="size-3.5" strokeWidth={ICON_STROKE} /> {t("start")}
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DashboardPageSection>

      {/* Click-to-call modal */}
      <AnimatePresence>
        {showCallModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="dashboard-modal-overlay"
            onClick={() => setShowCallModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-modal-panel sm:max-w-md !p-0"
            >
              <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6 border-b border-border">
                <div className="flex items-center gap-3 min-w-0">
                  <IconBox icon={Phone} variant="accent" size="sm" />
                  <h2 className="text-lg font-semibold text-foreground truncate">{t("callNow")}</h2>
                </div>
                <button type="button" onClick={() => setShowCallModal(false)} className="dashboard-icon-btn !size-8" aria-label={t("close")}>
                  <X className="size-4" strokeWidth={ICON_STROKE} />
                </button>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                <div>
                  <label className="dashboard-field-label" htmlFor="call-number">{t("phoneNumber")}</label>
                  <input
                    id="call-number"
                    type="tel"
                    value={callNumber}
                    onChange={(e) => setCallNumber(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="input"
                  />
                </div>
                <div>
                  <label className="dashboard-field-label" htmlFor="call-context">{t("callContext")}</label>
                  <textarea
                    id="call-context"
                    value={callContext}
                    onChange={(e) => setCallContext(e.target.value)}
                    placeholder="e.g. Following up on the quote we sent Jane last week"
                    className="input min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("callContextHint")}</p>
                </div>
                {callResult && <p className="text-sm text-muted-foreground">{callResult}</p>}
                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <button type="button" onClick={() => setShowCallModal(false)} className="btn-ghost flex-1">{tCommon("cancel")}</button>
                  <button type="button" onClick={placeCall} disabled={!callNumber.trim() || callSubmitting} className="btn-primary flex-1">
                    {callSubmitting ? t("calling") : t("callNow")}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New campaign modal */}
      <AnimatePresence>
        {showCampaignModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="dashboard-modal-overlay"
            onClick={() => setShowCampaignModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-modal-panel sm:max-w-lg !p-0"
            >
              <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6 border-b border-border">
                <div className="flex items-center gap-3 min-w-0">
                  <IconBox icon={Megaphone} variant="accent" size="sm" />
                  <h2 className="text-lg font-semibold text-foreground truncate">{t("newCampaign")}</h2>
                </div>
                <button type="button" onClick={() => setShowCampaignModal(false)} className="dashboard-icon-btn !size-8" aria-label={t("close")}>
                  <X className="size-4" strokeWidth={ICON_STROKE} />
                </button>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                <div>
                  <label className="dashboard-field-label" htmlFor="campaign-name">{t("campaignName")}</label>
                  <input
                    id="campaign-name"
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="Spring promo follow-up"
                    className="input"
                  />
                </div>
                <div>
                  <label className="dashboard-field-label" htmlFor="campaign-purpose">{t("purpose")}</label>
                  <select
                    id="campaign-purpose"
                    value={campaignPurpose}
                    onChange={(e) => setCampaignPurpose(e.target.value as CampaignPurpose)}
                    className="input"
                  >
                    <option value="campaign">{t("purposeSales")}</option>
                    <option value="reminder">{t("purposeReminder")}</option>
                    <option value="follow_up">{t("purposeFollowUp")}</option>
                  </select>
                </div>
                <div>
                  <label className="dashboard-field-label" htmlFor="campaign-targets">{t("phoneNumbers")}</label>
                  <textarea
                    id="campaign-targets"
                    value={campaignTargets}
                    onChange={(e) => setCampaignTargets(e.target.value)}
                    placeholder={"+15550001111\n+15550002222"}
                    className="input min-h-[120px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("phoneNumbersHint")}</p>
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <button type="button" onClick={() => setShowCampaignModal(false)} className="btn-ghost flex-1">{tCommon("cancel")}</button>
                  <button
                    type="button"
                    onClick={createCampaign}
                    disabled={!campaignName.trim() || !campaignTargets.trim() || campaignSubmitting}
                    className="btn-primary flex-1"
                  >
                    {campaignSubmitting ? t("creating") : t("createCampaign")}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardPage>
  );
}
