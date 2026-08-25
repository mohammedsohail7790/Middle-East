"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  Bot, Save, Plus, X, Mic, Clock, Phone,
  CheckCircle, Users, Headphones, Globe, Sparkles, ListChecks,
} from "lucide-react";
import {
  api,
  prefetchCsrfToken,
  isGatewayReachable,
  gatewayUnreachableMessage,
  resolveTenantId,
} from "@/lib/api";
import { readApiGetCache } from "@/lib/api-get-cache";
import {
  normalizeAIConfig,
  toAIConfigSavePayload,
  normalizeTenantSettings,
  tenantSettingsToApi,
  type DashboardAIConfigShape,
} from "@/lib/gateway-adapters";
import { subscribeAIConfigUpdates } from "@/lib/realtime";
import { AdditionalAgentsPanel } from "@/components/agent/AdditionalAgentsPanel";
import { VoicePreviewPanel } from "@/components/agent/VoicePreviewPanel";
import { cn } from "@/lib/utils";
import { useDashboardSync } from "@/lib/dashboard-sync";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { AGENT_LANGUAGES, isAgentLanguageAllowed } from "@/lib/agent-languages";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

type AIConfig = DashboardAIConfigShape;

/** Realtime voice ids — friendly labels; live calls use these, preview maps to OpenAI TTS */
const VOICES = [
  { id: "marin", name: "Maya" },
  { id: "coral", name: "Sarah" },
  { id: "shimmer", name: "Emma" },
  { id: "cedar", name: "Chris" },
  { id: "ash", name: "Alex" },
  { id: "sage", name: "Sage" },
] as const;

const TONE_KEYS = ["professional", "friendly", "warm", "casual", "formal"] as const;

import { DASHBOARD_TIMEZONES } from "@/lib/timezones";

interface VoiceRoutingSettings {
  id: string;
  companyName: string;
  diagnosticFee: string;
  language: string;
  timezone: string;
  tone: string;
  transferNumber: string;
}

const cachedAgentConfig = (): AIConfig | null => {
  const raw = readApiGetCache<AIConfig>("/ai-config");
  return raw ? normalizeAIConfig(raw) : null;
};

export default function AgentPage() {
  const t = useTranslations("pages.agent");
  const tCommon = useTranslations("common");
  const { title, description } = useDashboardPageLabels("/dashboard/agent");
  const initialConfig = cachedAgentConfig();
  const [config, setConfig] = useState<AIConfig | null>(initialConfig);
  const [loading, setLoading] = useState(!initialConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newDoRule, setNewDoRule] = useState("");
  const [newDontRule, setNewDontRule] = useState("");
  const configDirtyRef = useRef(false);

  const [voiceRouting, setVoiceRouting] = useState<VoiceRoutingSettings | null>(null);
  const [voiceRoutingSaving, setVoiceRoutingSaving] = useState(false);
  const [voiceRoutingError, setVoiceRoutingError] = useState("");
  const [voiceRoutingSuccess, setVoiceRoutingSuccess] = useState("");
  const voiceRoutingDirtyRef = useRef(false);

  const loadVoiceRouting = useCallback(async (opts?: { silent?: boolean }) => {
    if (voiceRoutingDirtyRef.current && opts?.silent) return;
    try {
      const tenant = await api.get<Record<string, unknown>>("/tenants/me");
      setVoiceRouting(normalizeTenantSettings(tenant));
      setVoiceRoutingError("");
    } catch (e) {
      setVoiceRoutingError(e instanceof Error ? e.message : t("voiceRoutingLoadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void loadVoiceRouting();
  }, [loadVoiceRouting]);

  const patchVoiceRouting = (updater: (prev: VoiceRoutingSettings) => VoiceRoutingSettings) => {
    voiceRoutingDirtyRef.current = true;
    setVoiceRouting((prev) => (prev ? updater(prev) : prev));
  };

  const saveVoiceRouting = async () => {
    if (!voiceRouting) return;
    setVoiceRoutingSaving(true);
    setVoiceRoutingError("");
    setVoiceRoutingSuccess("");
    try {
      const tenantId = voiceRouting.id || (await resolveTenantId());
      await api.put(`/tenants/${tenantId}`, tenantSettingsToApi(voiceRouting));
      voiceRoutingDirtyRef.current = false;
      setVoiceRoutingSuccess(t("voiceRoutingSaved"));
      syncDashboardAction("settings");
      setTimeout(() => setVoiceRoutingSuccess(""), 3000);
    } catch (e) {
      setVoiceRoutingError(e instanceof Error ? e.message : t("voiceRoutingSaveFailed"));
    } finally {
      setVoiceRoutingSaving(false);
    }
  };

  const loadConfig = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    return api
      .get<AIConfig>("/ai-config")
      .then((data) => {
        if (configDirtyRef.current && !saving) return;
        setConfig(normalizeAIConfig(data));
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (!opts?.silent) setLoading(false);
      });
  }, [saving]);

  useEffect(() => {
    void prefetchCsrfToken();
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (loading || !config) return;
    const scrollToSection = (id: string) => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const hash = window.location.hash.slice(1);
    const legacyTab = new URLSearchParams(window.location.search).get("tab");
    const legacyMap: Record<string, string> = {
      agents: "per-number-agents",
      preview: "voice-preview",
    };
    if (hash) scrollToSection(hash);
    else if (legacyTab && legacyMap[legacyTab]) scrollToSection(legacyMap[legacyTab]);
  }, [loading, config]);

  useDashboardSync(["config", "knowledge", "settings"], () => {
    if (configDirtyRef.current) return;
    void loadConfig({ silent: true });
  });

  useEffect(() => {
    return subscribeAIConfigUpdates((remote) => {
      if (configDirtyRef.current) return;
      const normalized = normalizeAIConfig(remote);
      setConfig((prev) => {
        if (!prev) return normalized;
        const merged = { ...prev };
        for (const [key, value] of Object.entries(normalized)) {
          if (value !== undefined && value !== null) {
            (merged as Record<string, unknown>)[key] = value;
          }
        }
        return merged;
      });
    });
  }, []);

  const patchConfig = useCallback((updater: (prev: AIConfig) => AIConfig) => {
    configDirtyRef.current = true;
    setConfig((prev) => (prev ? updater(prev) : prev));
  }, []);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await api.put<DashboardAIConfigShape>(
        "/ai-config",
        toAIConfigSavePayload(config)
      );
      configDirtyRef.current = false;
      setConfig(normalizeAIConfig(saved));
      setSuccess(t("configSaved"));
      syncDashboardAction("config");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("configSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const addDoRule = () => {
    if (!newDoRule.trim() || !config) return;
    patchConfig((c) => ({ ...c, doRules: [...c.doRules, newDoRule.trim()] }));
    setNewDoRule("");
  };

  const addDontRule = () => {
    if (!newDontRule.trim() || !config) return;
    patchConfig((c) => ({ ...c, dontRules: [...c.dontRules, newDontRule.trim()] }));
    setNewDontRule("");
  };

  const removeDoRule = (index: number) => {
    if (!config) return;
    patchConfig((c) => ({ ...c, doRules: c.doRules.filter((_, i) => i !== index) }));
  };

  const removeDontRule = (index: number) => {
    if (!config) return;
    patchConfig((c) => ({ ...c, dontRules: c.dontRules.filter((_, i) => i !== index) }));
  };

  if (!config && !loading) {
    return (
      <DashboardPage
        title={title}
        description={t("descriptionLoading")}
        maxWidth="xl"
        error={error || t("loadFailed")}
      >
        <div className="dashboard-panel-padded text-center space-y-4">
          <IconBox icon={Bot} variant="muted" size="xl" className="mx-auto" />
          <button
            type="button"
            className="btn-primary mx-auto mt-4"
            onClick={async () => {
              setError("");
              const ok = await isGatewayReachable();
              if (!ok) {
                setError(gatewayUnreachableMessage());
                return;
              }
              void loadConfig();
            }}
          >
            {t("retry")}
          </button>
        </div>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage
      title={title}
      description={description}
      maxWidth="xl"
      loading={loading && !config}
      error={error || undefined}
      actions={
        config ? (
          <button type="button" onClick={saveConfig} disabled={saving} className="btn-primary w-full sm:w-auto shrink-0 justify-center">
            <Save className="size-4" strokeWidth={ICON_STROKE} /> {saving ? tCommon("saving") : t("saveChanges")}
          </button>
        ) : undefined
      }
    >
      {success && (
        <div className="dashboard-alert border-emerald-200 bg-emerald-50 text-emerald-800 flex items-center gap-2">
          <CheckCircle className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
          <p className="text-sm">{success}</p>
        </div>
      )}

      {config && (
      <>
      <section id="receptionist-config" className="scroll-mt-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
          {/* Agent Name */}
          <div className="dashboard-panel-padded">
            <SectionHeader icon={Bot} title={t("identity")} iconVariant="accent" className="mb-4" />
            <div className="space-y-4">
              <div>
                <label className="text-xs text-foreground-secondary mb-1.5 block" htmlFor="agent-name">{t("agentName")}</label>
                <input
                  id="agent-name"
                  type="text"
                  value={config.agentName}
                  onChange={(e) => patchConfig((c) => ({ ...c, agentName: e.target.value }))}
                  placeholder={t("defaultAgentName")}
                  className="input"
                />
              </div>
              <div>
                <label className="text-xs text-foreground-secondary mb-1.5 block" htmlFor="agent-greeting">{t("phoneGreeting")}</label>
                <textarea
                  id="agent-greeting"
                  value={config.greetingMessage || ""}
                  onChange={(e) => patchConfig((c) => ({ ...c, greetingMessage: e.target.value }))}
                  placeholder={t("greetingPlaceholder", { name: config.agentName || t("defaultAgentName") })}
                  rows={3}
                  className="input resize-none text-sm"
                />
                <p className="text-[10px] text-foreground-tertiary mt-1">
                  {t("greetingHint")}
                </p>
              </div>
              <div>
                <label className="text-xs text-foreground-secondary mb-1.5 block" htmlFor="agent-transfer-number">{t("emergencyTransfer")}</label>
                <input
                  id="agent-transfer-number"
                  type="tel"
                  value={config.transferPhoneNumber || ""}
                  onChange={(e) => patchConfig((c) => ({ ...c, transferPhoneNumber: e.target.value }))}
                  placeholder="+1 555 123 4567"
                  className="input"
                />
                <p className="text-[10px] text-foreground-tertiary mt-1">
                  {t("transferHint")}
                </p>
              </div>
            </div>
          </div>

          {/* Voice */}
          <div className="dashboard-panel-padded">
            <SectionHeader icon={Mic} title={t("voice")} iconVariant="violet" className="mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {VOICES.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  aria-pressed={config.voice === voice.id}
                  onClick={() => patchConfig((c) => ({ ...c, voice: voice.id }))}
                  className={cn(
                    "p-3 rounded-xl border text-left",
                    config.voice === voice.id
                      ? "border-accent/50 bg-accent/10"
                      : "border-border bg-muted hover:bg-background-hover"
                  )}
                  style={{ transition: "border-color 160ms ease-out, background-color 160ms ease-out" }}
                >
                  <div className="flex items-center gap-2">
                    <Mic className={cn("size-4", config.voice === voice.id ? "text-accent" : "text-muted-foreground")} strokeWidth={ICON_STROKE} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{voice.name}</p>
                      <p className="text-[10px] text-foreground-secondary">{t(`voices.${voice.id}`)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className="dashboard-panel-padded">
            <SectionHeader
              icon={Globe}
              title={t("language")}
              iconVariant="neutral"
              description={t("languageDesc")}
              className="mb-4"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AGENT_LANGUAGES.map((lang) => {
                const allowed = isAgentLanguageAllowed(config.allowedLanguages, lang.id);
                return (
                  <button
                    key={lang.id}
                    type="button"
                    disabled={!allowed}
                    aria-pressed={config.language === lang.id}
                    onClick={() => {
                      if (!allowed) return;
                      patchConfig((c) => ({ ...c, language: lang.id }));
                    }}
                    className={cn(
                      "p-3 rounded-xl border text-left",
                      !allowed && "opacity-50 cursor-not-allowed",
                      config.language === lang.id
                        ? "border-accent/50 bg-accent/10"
                        : "border-border bg-muted hover:bg-background-hover"
                    )}
                    style={{ transition: "border-color 160ms ease-out, background-color 160ms ease-out" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground-secondary">{lang.name}</span>
                      {!allowed && (
                        <span className="text-[10px] text-amber-700 ml-auto">{t("proPlus")}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Right Column */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-6">
          {/* Tone */}
          <div className="dashboard-panel-padded">
            <SectionHeader icon={Sparkles} title={t("tone")} iconVariant="accent" className="mb-4" />
            <div className="flex flex-wrap gap-2">
              {TONE_KEYS.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  aria-pressed={config.tone === tone}
                  onClick={() => patchConfig((c) => ({ ...c, tone }))}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium",
                    config.tone === tone
                      ? "bg-accent-light text-accent-dark border border-accent/30"
                      : "bg-background-hover text-foreground-secondary border border-border hover:text-foreground-secondary"
                  )}
                  style={{ transition: "background-color 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out" }}
                >
                  {t(`tones.${tone}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Instructions */}
          <div className="dashboard-panel-padded">
            <SectionHeader title={t("customInstructions")} iconVariant="muted" className="mb-4" />
            <label htmlFor="agent-custom-instructions" className="sr-only">{t("customInstructions")}</label>
            <textarea
              id="agent-custom-instructions"
              value={config.customInstructions}
              onChange={(e) => patchConfig((c) => ({ ...c, customInstructions: e.target.value }))}
              placeholder={t("customInstructionsPlaceholder")}
              rows={4}
              className="input resize-none"
            />
          </div>

          {/* Do/Don't Rules */}
          <div className="dashboard-panel-padded">
            <SectionHeader icon={ListChecks} title={t("behaviorRules")} iconVariant="warning" className="mb-4" />
            <div className="space-y-4">
              {/* Do Rules */}
              <div>
                <label className="text-xs text-emerald-600 mb-2 block font-medium">{t("do")}</label>
                <div className="space-y-1.5 mb-2">
                  {(config.doRules || []).map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/[0.05] border border-emerald-500/10">
                      <span className="text-xs text-foreground-secondary flex-1">{rule}</span>
                      <button type="button" onClick={() => removeDoRule(i)} aria-label={t("removeDoRule", { rule })} className="text-foreground-tertiary hover:text-red-600">
                        <X className="size-3" strokeWidth={ICON_STROKE} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDoRule}
                    onChange={(e) => setNewDoRule(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addDoRule()}
                    placeholder={t("addRule")}
                    aria-label={t("addDoRule")}
                    className="input flex-1"
                  />
                  <button type="button" onClick={addDoRule} className="btn-ghost px-3">
                    <Plus className="size-4" strokeWidth={ICON_STROKE} />
                  </button>
                </div>
              </div>

              {/* Don't Rules */}
              <div>
                <label className="text-xs text-red-600 mb-2 block font-medium">{t("dont")}</label>
                <div className="space-y-1.5 mb-2">
                  {(config.dontRules || []).map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-red-500/[0.05] border border-red-500/10">
                      <span className="text-xs text-foreground-secondary flex-1">{rule}</span>
                      <button type="button" onClick={() => removeDontRule(i)} aria-label={t("removeDontRule", { rule })} className="text-foreground-tertiary hover:text-red-600">
                        <X className="size-3" strokeWidth={ICON_STROKE} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDontRule}
                    onChange={(e) => setNewDontRule(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addDontRule()}
                    placeholder={t("addRule")}
                    aria-label={t("addDontRule")}
                    className="input flex-1"
                  />
                  <button type="button" onClick={addDontRule} className="btn-ghost px-3">
                    <Plus className="size-4" strokeWidth={ICON_STROKE} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Capabilities */}
          <div className="dashboard-panel-padded">
            <SectionHeader icon={CheckCircle} title={t("capabilities")} iconVariant="success" className="mb-4" />
            <div className="space-y-3">
              {[
                { key: "bookAppointments", label: t("bookAppointments"), desc: t("bookAppointmentsDesc") },
                { key: "transferCalls", label: t("transferCalls"), desc: t("transferCallsDesc") },
                { key: "collectPayments", label: t("collectPayments"), desc: t("collectPaymentsDesc"), comingSoon: true },
                { key: "accessKnowledge", label: t("accessKnowledge"), desc: t("accessKnowledgeDesc") },
              ].map((cap) => (
                <div key={cap.key} className="flex items-center justify-between p-3 rounded-xl bg-muted border border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <div>
                      <p className="text-sm text-foreground/80">{cap.label}</p>
                      <p className="text-xs text-foreground-tertiary">{cap.desc}</p>
                    </div>
                    {cap.comingSoon && (
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted-foreground/15 text-muted-foreground">{t("soon")}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(config.capabilities[cap.key as keyof typeof config.capabilities])}
                    aria-label={cap.label}
                    disabled={cap.comingSoon}
                    onClick={() =>
                      !cap.comingSoon && patchConfig((c) => ({
                        ...c,
                        capabilities: {
                          ...c.capabilities,
                          [cap.key]: !c.capabilities[cap.key as keyof typeof c.capabilities],
                        },
                      }))
                    }
                    className={cn(
                      "w-10 h-6 rounded-full relative shrink-0 disabled:opacity-40 disabled:cursor-not-allowed",
                      config.capabilities[cap.key as keyof typeof config.capabilities]
                        ? "bg-accent"
                        : "bg-gray-200 dark:bg-muted"
                    )}
                    style={{ transition: "background-color 160ms ease-out" }}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full bg-white absolute top-1",
                        config.capabilities[cap.key as keyof typeof config.capabilities] ? "left-5" : "left-1"
                      )}
                      style={{ transition: "left 160ms ease-out" }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
      </section>

      <section id="voice-routing" className="mt-10 scroll-mt-24">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="dashboard-panel-padded space-y-6">
          <SectionHeader
            icon={Phone}
            title={t("voiceRouting")}
            iconVariant="violet"
            description={t("voiceRoutingDesc")}
          />
          {voiceRoutingError && (
            <div className="dashboard-alert dashboard-alert-error" role="alert">
              <p className="text-sm">{voiceRoutingError}</p>
            </div>
          )}
          {voiceRoutingSuccess && (
            <div className="dashboard-alert border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200">
              <CheckCircle className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
              <p className="text-sm">{voiceRoutingSuccess}</p>
            </div>
          )}
          {voiceRouting && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="vr-language" className="dashboard-field-label flex items-center gap-2">
                    <Globe className="w-4 h-4 text-foreground-tertiary" />
                    {t("language")}
                  </label>
                  <select
                    id="vr-language"
                    value={voiceRouting.language}
                    onChange={(e) => patchVoiceRouting((s) => ({ ...s, language: e.target.value }))}
                    className="input"
                  >
                    {AGENT_LANGUAGES.map((lang) => (
                      <option key={lang.id} value={lang.id}>{lang.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="vr-timezone" className="dashboard-field-label flex items-center gap-2">
                    <Clock className="w-4 h-4 text-foreground-tertiary" />
                    {t("timezone")}
                  </label>
                  <select
                    id="vr-timezone"
                    value={voiceRouting.timezone}
                    onChange={(e) => patchVoiceRouting((s) => ({ ...s, timezone: e.target.value }))}
                    className="input"
                  >
                    {DASHBOARD_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <span id="vr-tone-label" className="dashboard-field-label">{t("tone")}</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="vr-tone-label">
                  {TONE_KEYS.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => patchVoiceRouting((s) => ({ ...s, tone }))}
                      aria-pressed={voiceRouting.tone === tone}
                      className={cn("seg-pill capitalize", voiceRouting.tone === tone && "is-active")}
                    >
                      {t(`tones.${tone}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="vr-transfer-number" className="dashboard-field-label flex items-center gap-2">
                  <Phone className="w-4 h-4 text-foreground-tertiary" />
                  {t("transferNumber")}
                </label>
                <input
                  id="vr-transfer-number"
                  type="tel"
                  value={voiceRouting.transferNumber}
                  onChange={(e) => patchVoiceRouting((s) => ({ ...s, transferNumber: e.target.value }))}
                  placeholder="+1 (555) 000-0000"
                  className="input"
                />
                <p className="dashboard-field-hint">
                  {t("transferRoutingHint")}
                </p>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => void saveVoiceRouting()} disabled={voiceRoutingSaving} className="btn-primary">
                  <Save className="size-4" strokeWidth={ICON_STROKE} /> {voiceRoutingSaving ? tCommon("saving") : t("saveVoiceRouting")}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </section>

      <section id="voice-preview" className="mt-10 scroll-mt-24">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeader icon={Headphones} title={t("voicePreview")} iconVariant="accent" className="mb-4" />
          <VoicePreviewPanel config={config} />
        </motion.div>
      </section>

      <section id="per-number-agents" className="mt-10 scroll-mt-24">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeader
            icon={Users}
            title={t("perNumberAgents")}
            iconVariant="violet"
            description={t("perNumberAgentsDesc")}
            className="mb-4"
          />
          <AdditionalAgentsPanel />
        </motion.div>
      </section>
      </>
      )}
    </DashboardPage>
  );
}
