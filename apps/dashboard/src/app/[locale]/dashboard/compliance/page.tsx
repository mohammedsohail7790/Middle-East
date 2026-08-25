"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  Shield, Download, Trash2, FileText, Database, Clock,
  FileCheck, Mic, MicOff, MessageSquare, Building2, Save, Info,
  ChevronRight, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api";
import { SUPPORT_EMAIL } from "@/lib/integration-support";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { StatCard } from "@/components/ui-kit/StatCard";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";
import { useConfirm } from "@/components/ui-kit/ConfirmDialog";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { showDashboardToast } from "@/lib/dashboard-toast";
import { DASHBOARD_POLL_MS } from "@/lib/dashboard-sync";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { cn } from "@/lib/utils";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

// ─── Compliance Center types ────────────────────────────────────────────────

type IndustryProfile = "healthcare" | "legal" | "real_estate" | "general";

interface ComplianceSettings {
  tenantId: string;
  aiDisclosureEnabled: boolean;
  aiDisclosureMessage: string;
  recordingEnabled: boolean;
  recordingAnnouncementEnabled: boolean;
  recordingAnnouncementMessage: string;
  consentRequired: boolean;
  consentMessage: string;
  consentOffersRecordingChoice: boolean;
  consentRecordingChoiceMessage: string;
  dataRetentionDays: number | null;
  industryProfile: IndustryProfile;
  updatedAt: string;
}

interface ProfileDefault {
  aiDisclosureEnabled: boolean;
  aiDisclosureMessage: string;
  recordingEnabled: boolean;
  recordingAnnouncementEnabled: boolean;
  recordingAnnouncementMessage: string;
  consentRequired: boolean;
  consentMessage: string;
  consentOffersRecordingChoice: boolean;
  consentRecordingChoiceMessage: string;
  dataRetentionDays: number | null;
}

interface IndustryProfileDef {
  id: IndustryProfile;
  label: string;
  description: string;
  strictness: "strict" | "standard";
  defaults: ProfileDefault;
}

interface RetentionSummary {
  totalCalls: number;
  totalLeads: number;
  totalSms: number;
  retentionDays: number;
  oldestRecordAt: string | null;
}

interface AuditEvent {
  id: string;
  event_type: string;
  actor_id: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
}

const RETENTION_OPTION_KEYS: { key: string; days: number | null }[] = [
  { key: "retention30", days: 30 },
  { key: "retention60", days: 60 },
  { key: "retention90", days: 90 },
  { key: "retention180", days: 180 },
  { key: "retention1y", days: 365 },
  { key: "retention3y", days: 1095 },
  { key: "retention7y", days: 2555 },
  { key: "retentionIndefinite", days: null },
];

// ─── Shared UI bits ──────────────────────────────────────────────────────────

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn("toggle-row cursor-pointer", disabled && "opacity-50 pointer-events-none")}
      onClick={() => !disabled && onChange(!checked)}
    >
      <div className="toggle-row-text">
        <span className="toggle-row-label">{label}</span>
        {hint && <span className="toggle-row-hint">{hint}</span>}
      </div>
      <label className="toggle" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.checked)}
        />
        <span className="toggle-track">
          <span className="toggle-thumb" />
        </span>
      </label>
    </label>
  );
}

function DisclaimerBanner() {
  const t = useTranslations("pages.compliance");
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3">
      <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" strokeWidth={ICON_STROKE} />
      <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
        <strong>{t("important")}</strong> {t("disclaimer")}
      </p>
    </div>
  );
}

function ProfileCard({
  profile,
  selected,
  onSelect,
  onApply,
  applying,
}: {
  profile: IndustryProfileDef;
  selected: boolean;
  onSelect: () => void;
  onApply: () => void;
  applying: boolean;
}) {
  const t = useTranslations("pages.compliance");
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border p-4",
        selected ? "border-accent bg-accent/5 dark:bg-accent/10" : "border-border bg-card hover:border-accent/50"
      )}
      style={{ transition: "border-color 200ms ease-out, background-color 200ms ease-out" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{profile.label}</span>
            <span
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-medium rounded-full",
                profile.strictness === "strict"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {profile.strictness === "strict" ? t("stricterDefaults") : t("standardDefaults")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{profile.description}</p>
        </div>
        {selected && <CheckCircle2 className="size-4 shrink-0 text-accent mt-0.5" strokeWidth={ICON_STROKE} />}
      </div>
      {selected && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onApply();
          }}
          disabled={applying}
          className="mt-3 btn-ghost text-xs w-full justify-center"
        >
          {applying ? t("applying") : t("resetDefaults")}
          <ChevronRight className="size-3" strokeWidth={ICON_STROKE} />
        </button>
      )}
    </button>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const t = useTranslations("pages.compliance");
  const tCommon = useTranslations("common");
  const { title, description } = useDashboardPageLabels("/dashboard/compliance");
  const retentionOptions = useMemo(
    () => RETENTION_OPTION_KEYS.map((opt) => ({ ...opt, label: t(opt.key) })),
    [t]
  );
  // Compliance Center state
  const [settings, setSettings] = useState<ComplianceSettings | null>(null);
  const [profiles, setProfiles] = useState<IndustryProfileDef[]>([]);
  const [ccLoading, setCcLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingProfile, setApplyingProfile] = useState<IndustryProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  // Retention / audit / GDPR / redaction state
  const [retention, setRetention] = useState<RetentionSummary | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [redactInput, setRedactInput] = useState("");
  const [redactResult, setRedactResult] = useState("");
  const [redacting, setRedacting] = useState(false);

  const loadComplianceCenter = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setCcLoading(true);
    try {
      const res = await api.get<{ settings: ComplianceSettings; profiles: IndustryProfileDef[] }>(
        "/compliance/center"
      );
      if (opts?.silent && dirty) return;
      setSettings(res.settings);
      setProfiles(res.profiles);
    } catch (e) {
      if (!opts?.silent) {
        showDashboardToast({
          type: "error",
          title: "Could not load compliance settings",
          message: e instanceof Error ? e.message : "Request failed",
        });
      }
    } finally {
      if (!opts?.silent) setCcLoading(false);
    }
  }, [dirty]);

  const loadData = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    Promise.allSettled([
      api.get<RetentionSummary>("/compliance/retention"),
      api.get<AuditEvent[]>("/compliance/audit-events?limit=20"),
    ])
      .then(([retRes, auditRes]) => {
        if (retRes.status === "fulfilled") setRetention(retRes.value);
        if (auditRes.status === "fulfilled") {
          const list = Array.isArray(auditRes.value) ? auditRes.value : [];
          setAuditEvents(list);
        }
        const errors: string[] = [];
        if (retRes.status === "rejected") errors.push(`Retention: ${retRes.reason instanceof Error ? retRes.reason.message : String(retRes.reason)}`);
        if (auditRes.status === "rejected") errors.push(`Audit: ${auditRes.reason instanceof Error ? auditRes.reason.message : String(auditRes.reason)}`);
        if (errors.length > 0) setError(errors.join("; "));
        else setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useRealtimeQuery(["settings", "config"], () => {
    void loadComplianceCenter({ silent: true });
    loadData({ silent: true });
  }, "", {
    pollMs: DASHBOARD_POLL_MS,
    pollOnlyWhenDisconnected: true,
  });

  useEffect(() => {
    void loadComplianceCenter();
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (updates: Partial<ComplianceSettings>) => {
    setDirty(true);
    setSettings((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await api.put<ComplianceSettings>("/compliance/center", settings);
      setSettings(saved);
      setDirty(false);
      syncDashboardAction("config");
      showDashboardToast({ type: "success", title: t("settingsSaved") });
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

  const applyProfile = async (profile: IndustryProfile) => {
    setApplyingProfile(profile);
    try {
      const saved = await api.post<ComplianceSettings>("/compliance/center/apply-profile", { profile });
      setSettings(saved);
      setDirty(false);
      syncDashboardAction("config");
      showDashboardToast({
        type: "success",
        title: `${profiles.find((p) => p.id === profile)?.label ?? profile} defaults applied`,
      });
    } catch (e) {
      showDashboardToast({
        type: "error",
        title: "Could not apply profile",
        message: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setApplyingProfile(null);
    }
  };

  const requestGdprExport = async () => {
    setExporting(true);
    try {
      const result = await api.post<{ exportId: string; message: string }>("/compliance/gdpr-export", {});
      showDashboardToast({
        type: "success",
        title: "Export requested",
        message: result.message || "Your data export will be ready shortly. Check your email.",
        durationMs: 6000,
      });
    } catch (e) {
      showDashboardToast({
        type: "error",
        title: "Export failed",
        message: e instanceof Error ? e.message : "Could not request export",
      });
    } finally {
      setExporting(false);
    }
  };

  const testRedact = async () => {
    if (!redactInput.trim()) return;
    setRedacting(true);
    try {
      const result = await api.post<{ redacted: string }>("/compliance/redact", { text: redactInput });
      setRedactResult(result.redacted);
    } catch {
      setRedactResult("[Redaction service unavailable]");
    } finally {
      setRedacting(false);
    }
  };

  return (
    <DashboardPage
      title={title}
      description={description}
      loading={ccLoading && !settings}
      error={error || undefined}
      actions={
        settings ? (
          <button onClick={() => void save()} disabled={saving || !dirty} className="btn-primary w-full sm:w-auto justify-center">
            <Save className="size-4" strokeWidth={ICON_STROKE} />
            {saving ? tCommon("saving") : t("saveChanges")}
          </button>
        ) : undefined
      }
    >
      {settings && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <DisclaimerBanner />

          {/* ── Industry Profile ─────────────────────────────────────────── */}
          <section className="dashboard-panel-padded space-y-4">
            <SectionHeader
              icon={Building2}
              title={t("industryProfile")}
              iconVariant="accent"
              description={t("industryProfileDesc")}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  selected={settings.industryProfile === p.id}
                  onSelect={() => patch({ industryProfile: p.id })}
                  onApply={() => void applyProfile(p.id)}
                  applying={applyingProfile === p.id}
                />
              ))}
            </div>
          </section>

          {/* ── AI Disclosure ────────────────────────────────────────────── */}
          <section className="dashboard-panel-padded space-y-4">
            <SectionHeader
              icon={MessageSquare}
              title={t("aiDisclosure")}
              iconVariant="violet"
              description={t("aiDisclosureDesc")}
            />
            <ToggleRow
              label={t("announceAi")}
              hint={t("announceAiHint")}
              checked={settings.aiDisclosureEnabled}
              onChange={(v) => {
                if (v) {
                  patch({ aiDisclosureEnabled: true });
                  return;
                }
                void confirm({
                  title: "Disable AI disclosure?",
                  message: "Most jurisdictions require informing callers they're speaking with an AI assistant. Disabling this announcement may create legal risk for your business. By continuing, you acknowledge this risk and accept responsibility for compliance in your jurisdiction.",
                  confirmLabel: "Disable disclosure",
                  tone: "danger",
                }).then((ok) => {
                  if (ok) patch({ aiDisclosureEnabled: false });
                });
              }}
            />
            {settings.aiDisclosureEnabled && (
              <div>
                <label htmlFor="compliance-disclosure-message" className="dashboard-field-label">{t("disclosureMessage")}</label>
                <input
                  id="compliance-disclosure-message"
                  type="text"
                  value={settings.aiDisclosureMessage}
                  onChange={(e) => patch({ aiDisclosureMessage: e.target.value })}
                  maxLength={500}
                  className="input"
                  placeholder={t("disclosurePlaceholder")}
                />
                <p className="dashboard-field-hint">{t("disclosureMessageHint")}</p>
              </div>
            )}
          </section>

          {/* ── Call Recording ───────────────────────────────────────────── */}
          <section className="dashboard-panel-padded space-y-4">
            <SectionHeader
              icon={Mic}
              title={t("callRecording")}
              iconVariant="accent"
              description={t("callRecordingDesc")}
            />
            <ToggleRow
              label={t("recordCalls")}
              hint={t("recordCallsHint")}
              checked={settings.recordingEnabled}
              onChange={(v) => {
                if (!v) {
                  patch({ recordingEnabled: false });
                  return;
                }
                void confirm({
                  title: "Enable call recording?",
                  message: "Call recording is subject to federal, state, and industry-specific laws — many states require all-party consent, with criminal penalties for violations. By continuing, you acknowledge this risk and accept responsibility for legal compliance in your jurisdiction. Consult your legal advisor before enabling.",
                  confirmLabel: "Enable recording",
                  tone: "danger",
                }).then((ok) => {
                  if (ok) patch({ recordingEnabled: true });
                });
              }}
            />
            {!settings.recordingEnabled && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MicOff className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
                <span>{t("callsNotRecorded")}</span>
              </div>
            )}

            {settings.recordingEnabled && (
              <>
                <div className="border-t border-border pt-4">
                  <ToggleRow
                    label={t("playRecordingAnnouncement")}
                    hint={`"This call may be recorded…" — required by many state laws (e.g. California, Illinois) when recording.`}
                    checked={settings.recordingAnnouncementEnabled}
                    onChange={(v) => patch({ recordingAnnouncementEnabled: v })}
                  />
                </div>
                {settings.recordingAnnouncementEnabled && (
                  <div>
                    <label htmlFor="compliance-recording-announcement" className="dashboard-field-label">{t("announcementMessage")}</label>
                    <input
                      id="compliance-recording-announcement"
                      type="text"
                      value={settings.recordingAnnouncementMessage}
                      onChange={(e) => patch({ recordingAnnouncementMessage: e.target.value })}
                      maxLength={500}
                      className="input"
                    />
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Caller Consent ───────────────────────────────────────────── */}
          <section className="dashboard-panel-padded space-y-4">
            <SectionHeader
              icon={Shield}
              title={t("callerConsent")}
              iconVariant="violet"
              description={t("callerConsentDesc")}
            />
            <ToggleRow
              label={t("requireConfirmation")}
              hint="Plays a prompt and waits for the caller to press a key before connecting to the AI. Callers who don't press 1 still reach the AI normally — the call just isn't recorded or transcribed."
              checked={settings.consentRequired}
              onChange={(v) => patch({ consentRequired: v })}
            />
            {settings.consentRequired && (
              <>
                <div className="border-t border-border pt-4">
                  <ToggleRow
                    label="Offer a recording choice instead of a simple yes/no"
                    hint={`Caller presses 1 to consent to recording (recorded & transcribed), or 2 to continue without recording — like the consent flow some AI receptionist services use.`}
                    checked={settings.consentOffersRecordingChoice}
                    onChange={(v) => patch({ consentOffersRecordingChoice: v })}
                  />
                </div>
                {settings.consentOffersRecordingChoice ? (
                  <div>
                    <label htmlFor="compliance-recording-choice-prompt" className="dashboard-field-label">Recording-choice prompt</label>
                    <input
                      id="compliance-recording-choice-prompt"
                      type="text"
                      value={settings.consentRecordingChoiceMessage}
                      onChange={(e) => patch({ consentRecordingChoiceMessage: e.target.value })}
                      maxLength={500}
                      className="input"
                      placeholder="If you consent to this call being recorded and transcribed, press 1. To continue without recording, press 2."
                    />
                    <p className="dashboard-field-hint flex items-center gap-1.5">
                      <Info className="size-3.5 shrink-0" strokeWidth={ICON_STROKE} />
                      Press 1 = call is recorded and transcribed. Press 2, any other input, or no input =
                      call continues normally but is not recorded or transcribed, regardless of the Call
                      Recording setting above.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="compliance-consent-prompt" className="dashboard-field-label">Consent prompt</label>
                    <input
                      id="compliance-consent-prompt"
                      type="text"
                      value={settings.consentMessage}
                      onChange={(e) => patch({ consentMessage: e.target.value })}
                      maxLength={500}
                      className="input"
                      placeholder="Press 1 to continue."
                    />
                    <p className="dashboard-field-hint flex items-center gap-1.5">
                      <Info className="size-3.5 shrink-0" strokeWidth={ICON_STROKE} />
                      The caller must press 1. Any other input or no input continues the call normally,
                      just without recording or a transcript.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Data Retention ───────────────────────────────────────────── */}
          <section className="dashboard-panel-padded space-y-4">
            <SectionHeader
              icon={Clock}
              title={t("dataRetention")}
              iconVariant="accent"
              description={t("dataRetentionDesc")}
            />
            <div>
              <span id="compliance-retention-label" className="dashboard-field-label">{t("deleteAfter")}</span>
              <div className="flex flex-wrap gap-2 mt-2" role="group" aria-labelledby="compliance-retention-label">
                {retentionOptions.map((opt) => (
                  <button
                    key={String(opt.days)}
                    type="button"
                    onClick={() => patch({ dataRetentionDays: opt.days })}
                    aria-pressed={settings.dataRetentionDays === opt.days}
                    className={cn("seg-pill", settings.dataRetentionDays === opt.days && "is-active")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {settings.dataRetentionDays === null && (
                <p className="dashboard-field-hint flex items-center gap-1.5 mt-2">
                  <Info className="size-3.5 shrink-0 text-amber-500" strokeWidth={ICON_STROKE} />
                  <span className="text-amber-700 dark:text-amber-400">
                    Keeping recordings indefinitely may create legal liability in some jurisdictions.
                    Review your local data privacy laws.
                  </span>
                </p>
              )}
            </div>
          </section>

          {/* ── Current configuration summary ─────────────────────────────── */}
          <section className="dashboard-panel-padded">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">
              {t("activeSummary")}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: t("summaryAiDisclosure"), value: settings.aiDisclosureEnabled ? t("on") : t("off"), ok: settings.aiDisclosureEnabled },
                { label: t("summaryCallRecording"), value: settings.recordingEnabled ? t("on") : t("off"), ok: null },
                {
                  label: t("summaryConsentGate"),
                  value: settings.consentRequired
                    ? (settings.consentOffersRecordingChoice ? t("consentRecordingChoice") : t("consentRequired"))
                    : t("notRequired"),
                  ok: null,
                },
                {
                  label: t("summaryRetention"),
                  value: settings.dataRetentionDays === null ? t("indefinite") : `${settings.dataRetentionDays}d`,
                  ok: null,
                },
                {
                  label: t("summaryProfile"),
                  value: profiles.find((p) => p.id === settings.industryProfile)?.label ?? settings.industryProfile,
                  ok: null,
                },
              ].map(({ label, value, ok }) => (
                <div key={label} className="rounded-xl border border-border bg-muted/40 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      ok === true ? "text-emerald-600 dark:text-emerald-400" : ok === false ? "text-red-500" : "text-foreground"
                    )}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </motion.div>
      )}

      {/* ── Overview stats ──────────────────────────────────────────────── */}
      <div className="dashboard-stat-grid dashboard-stat-grid--three">
        <StatCard label={t("totalCallsStored")} value={retention?.totalCalls ?? 0} icon={Database} iconVariant="accent" index={0} />
        <StatCard label={t("retentionPeriod")} value={`${retention?.retentionDays ?? 90}d`} icon={Clock} iconVariant="violet" index={1} />
        <StatCard label={t("auditEvents")} value={auditEvents.length} icon={FileText} iconVariant="neutral" index={2} />
      </div>

      {/* ── Data Subject Rights + PII Redaction (below the main config) ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardPageSection
          title={t("dataSubjectRights")}
          icon={Shield}
          iconVariant="accent"
          description={t("dataSubjectRightsDesc")}
        >
          <div className="space-y-4">
            <div className="dashboard-panel p-4 space-y-3">
              <div className="flex items-start gap-3">
                <IconBox icon={Download} variant="accent" size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("exportAllData")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("exportAllDataDesc")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void requestGdprExport()}
                disabled={exporting}
                className="btn-ghost w-full text-sm justify-center"
              >
                <Download className="size-4" strokeWidth={ICON_STROKE} />
                {exporting ? t("requesting") : t("requestGdprExport")}
              </button>
            </div>

            <div className="dashboard-panel p-4 space-y-3">
              <div className="flex items-start gap-3">
                <IconBox icon={Trash2} variant="error" size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("secureDeletion")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("secureDeletionDesc")}</p>
                </div>
              </div>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Secure%20Deletion%20Request`}
                className="btn-ghost w-full text-sm justify-center block text-center"
              >
                <Trash2 className="size-4 inline mr-1.5" strokeWidth={ICON_STROKE} />
                {t("requestDeletion")}
              </a>
            </div>
          </div>
        </DashboardPageSection>

        <DashboardPageSection
          title={t("piiTester")}
          icon={FileText}
          iconVariant="violet"
          description={t("piiTesterDesc")}
        >
          <div className="space-y-3">
            <textarea
              rows={4}
              value={redactInput}
              onChange={(e) => setRedactInput(e.target.value)}
              placeholder={t("redactPlaceholder")}
              className="input resize-none w-full text-sm"
            />
            <button
              type="button"
              onClick={() => void testRedact()}
              disabled={redacting || !redactInput.trim()}
              className="btn-primary w-full text-sm"
            >
              {redacting ? t("redacting") : t("testRedaction")}
            </button>
            {redactResult && (
              <div className="rounded-xl border border-border bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">{t("redactedOutput")}</p>
                <p className="text-sm font-mono text-foreground break-all">{redactResult}</p>
              </div>
            )}
          </div>
        </DashboardPageSection>
      </div>

      <DashboardPageSection
        title={t("hipaaBaa")}
        icon={FileCheck}
        iconVariant="accent"
        description={t("hipaaBaaDesc")}
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            HIPAA Business Associate Agreements (BAA) are not currently offered on any plan.
            Halla AI does support healthcare compliance settings — including AI disclosure, call recording,
            and caller consent — through the settings above. However, a formal BAA is not available.
            If your business requires HIPAA compliance, contact{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a> and
            we&apos;ll follow up when this changes.
          </p>
        </div>
      </DashboardPageSection>

      <DashboardPageSection
        title={t("auditTrail")}
        icon={FileText}
        iconVariant="neutral"
        description={t("auditTrailDesc")}
      >
        {auditEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("noAuditEvents")}</p>
        ) : (
          <div className="divide-y divide-border">
            {auditEvents.map((ev) => (
              <div key={ev.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-muted text-muted-foreground shrink-0">
                  {ev.event_type}
                </span>
                <span className="text-xs text-muted-foreground flex-1">
                  {ev.resource_type} {ev.resource_id && <code className="font-mono text-[10px]">{ev.resource_id.slice(0, 8)}…</code>}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(ev.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </DashboardPageSection>

      {confirmDialog}
    </DashboardPage>
  );
}
