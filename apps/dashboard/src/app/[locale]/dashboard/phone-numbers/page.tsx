"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Plus, X, Search, Trash2,
  PhoneCall, MessageSquare, Globe, PhoneForwarded, ArrowUpRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api, asArray } from "@/lib/api";
import {
  friendlyPhoneSetupError,
  parsePhoneSearchResults,
  provisioningBlockedReason,
  type PhoneProvisioningStatus,
} from "@/lib/phone-setup";
import { normalizePhoneNumber } from "@/lib/gateway-adapters";
import { cn, formatPhone } from "@/lib/utils";
import { useDashboardSync } from "@/lib/dashboard-sync";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";
import { useConfirm } from "@/components/ui-kit/ConfirmDialog";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  capabilities: string[];
  cost: number;
  status: string;
  created_at: string;
  aiAgentId?: string | null;
}

interface AgentOption {
  id: string;
  name: string;
}

interface SearchResult {
  phoneNumber: string;
  locality: string;
  region: string;
  capabilities: string[];
  cost: number;
}

export default function PhoneNumbersPage() {
  const t = useTranslations("pages.phoneNumbers");
  const { title } = useDashboardPageLabels("/dashboard/phone-numbers");
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [addMode, setAddMode] = useState<"forward" | "new">("forward");
  const [areaCode, setAreaCode] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [phoneStats, setPhoneStats] = useState<PhoneProvisioningStatus | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const loadAgents = useCallback(() => {
    api
      .get<AgentOption[]>("/ivr/agents")
      .then((rows) =>
        setAgents(
          (Array.isArray(rows) ? (rows as unknown as Record<string, unknown>[]) : []).map((r) => ({
            id: String(r.id),
            name: String(r.name),
          }))
        )
      )
      .catch(() => {});
  }, []);

  const loadNumbers = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    api
      .get<{ numbers?: PhoneNumber[]; stats?: PhoneProvisioningStatus } | PhoneNumber[]>("/phone-numbers")
      .then((data) => {
        if (data && typeof data === "object" && "stats" in data && data.stats) {
          setPhoneStats(data.stats as PhoneProvisioningStatus);
        }
        const raw =
          data && typeof data === "object" && "numbers" in data
            ? (data as { numbers?: unknown }).numbers ?? data
            : data;
        const list = asArray<Record<string, unknown>>(raw).map((row) => {
          const n = normalizePhoneNumber(row);
          return {
            id: n.id,
            phoneNumber: n.phoneNumber,
            capabilities: n.capabilities,
            cost: n.monthlyCost,
            status: n.status,
            created_at: n.purchasedAt,
            aiAgentId: n.aiAgentId ?? null,
          };
        });
        setNumbers(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAgents();
    loadNumbers();
  }, [loadAgents, loadNumbers]);

  useDashboardSync(["phone", "config"], () => {
    loadAgents();
    loadNumbers({ silent: true });
  });

  const searchNumbers = async () => {
    if (!areaCode || areaCode.length < 3) return;
    const blocked = provisioningBlockedReason(phoneStats);
    if (blocked) {
      setError(blocked);
      return;
    }
    setSearching(true);
    setSearchResults([]);
    setError("");
    try {
      const results = await api.get<unknown>(`/phone-numbers/search?areaCode=${areaCode}`);
      const parsed = parsePhoneSearchResults(results);
      setSearchResults(
        parsed.map((r) => ({
          phoneNumber: r.phoneNumber,
          locality: r.friendlyName || r.region || "",
          region: r.region || "",
          capabilities: r.capabilities,
          cost: r.cost,
        }))
      );
      if (parsed.length === 0) setError(t("noSearchResults"));
    } catch (e: unknown) {
      setError(friendlyPhoneSetupError(e instanceof Error ? e.message : "Search failed"));
    } finally {
      setSearching(false);
    }
  };

  const purchaseNumber = async (phoneNumber: string) => {
    const blocked = provisioningBlockedReason(phoneStats);
    if (blocked) {
      setError(blocked);
      return;
    }
    setPurchasing(phoneNumber);
    setError("");
    try {
      await api.post<Record<string, unknown>>("/phone-numbers/purchase", {
        phoneNumber,
      });
      setShowModal(false);
      setSearchResults([]);
      setAreaCode("");
      await loadNumbers();
      syncDashboardAction("phone");
    } catch (e: unknown) {
      setError(friendlyPhoneSetupError(e instanceof Error ? e.message : "Purchase failed"));
    } finally {
      setPurchasing(null);
    }
  };

  const assignAgent = async (numberId: string, aiAgentId: string) => {
    try {
      await api.patch(`/phone-numbers/${numberId}/agent`, {
        aiAgentId: aiAgentId || null,
      });
      setNumbers((prev) =>
        prev.map((n) => (n.id === numberId ? { ...n, aiAgentId: aiAgentId || null } : n))
      );
      syncDashboardAction("phone");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("assignFailed"));
    }
  };

  const releaseNumber = async (id: string) => {
    const ok = await confirm({
      title: t("releaseConfirm"),
      message: t("releaseWarning"),
      confirmLabel: t("release"),
    });
    if (!ok) return;
    try {
      await api.del(`/phone-numbers/${id}`);
      setNumbers((prev) => prev.filter((n) => n.id !== id));
      syncDashboardAction("phone");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("releaseFailed"));
    }
  };

  const getCapabilityIcon = (cap: string) => {
    switch (cap) {
      case "voice":
        return <PhoneCall className="size-3" strokeWidth={ICON_STROKE} />;
      case "sms":
        return <MessageSquare className="size-3" strokeWidth={ICON_STROKE} />;
      case "mms":
        return <Globe className="size-3" strokeWidth={ICON_STROKE} />;
      default:
        return null;
    }
  };

  const planNote = phoneStats
    ? phoneStats.remaining > 0
      ? t("planNoteMore", {
          active: phoneStats.activeCount,
          max: phoneStats.maxAllowed,
          remaining: phoneStats.remaining,
        })
      : t("planNote", { active: phoneStats.activeCount, max: phoneStats.maxAllowed })
    : undefined;

  return (
    <DashboardPage
      title={title}
      description={planNote || t("description")}
      maxWidth="xl"
      loading={loading && numbers.length === 0}
      error={error || undefined}
      actions={
        <button
          type="button"
          onClick={() => {
            setShowModal(true);
            void api.get<PhoneProvisioningStatus>("/phone-numbers/stats").then(setPhoneStats).catch(() => {});
          }}
          disabled={phoneStats !== null && !phoneStats.canAddMore}
          className="btn-primary w-full sm:w-auto justify-center shrink-0 disabled:opacity-50"
        >
          <Plus className="size-4" strokeWidth={ICON_STROKE} /> {t("addNumber")}
        </button>
      }
    >
      {provisioningBlockedReason(phoneStats) && (
        <div className="dashboard-alert border-amber-200 bg-amber-50 text-amber-950 mb-6">
          <p className="text-sm">{provisioningBlockedReason(phoneStats)}</p>
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-panel overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : numbers.length === 0 ? (
          <EmptyState
            icon={Phone}
            title={t("noNumbers")}
            description={t("noNumbersDesc")}
            iconVariant="muted"
            action={
              <button type="button" onClick={() => setShowModal(true)} className="btn-primary text-sm">
                <Plus className="size-4" strokeWidth={ICON_STROKE} /> {t("addFirst")}
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {numbers.map((num, i) => (
              <motion.div
                key={num.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="dashboard-list-row sm:p-5"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <IconBox icon={Phone} variant="accent" size="md" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatPhone(num.phoneNumber)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {(num.capabilities || []).map((cap) => (
                        <span key={cap} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full bg-muted text-foreground-secondary">
                          {getCapabilityIcon(cap)}
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="dashboard-list-row-actions">
                  {agents.length > 0 && (
                    <select
                      aria-label={t("assignAgent", { phone: formatPhone(num.phoneNumber) })}
                      className="input text-xs py-1.5 w-full sm:max-w-[160px] min-w-0"
                      value={num.aiAgentId || ""}
                      onChange={(e) => assignAgent(num.id, e.target.value)}
                    >
                      <option value="">{t("defaultAgent")}</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="text-right">
                    <span className={cn(
                      "px-2 py-0.5 text-xs rounded-full",
                      num.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"
                    )}>
                      {num.status}
                    </span>
                    <p className="text-xs text-foreground-tertiary mt-1">${num.cost}/mo</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => releaseNumber(num.id)}
                    className="text-muted-foreground hover:text-red-600 transition-colors p-1"
                    aria-label={`Release ${formatPhone(num.phoneNumber)}`}
                  >
                    <Trash2 className="size-4" strokeWidth={ICON_STROKE} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Add Number Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="dashboard-modal-overlay"
            onClick={() => setShowModal(false)}
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
                  <IconBox icon={Phone} variant="accent" size="sm" />
                  <h2 className="text-lg font-semibold text-foreground truncate">{t("modalTitle")}</h2>
                </div>
                <button type="button" onClick={() => setShowModal(false)} className="dashboard-icon-btn !size-8" aria-label={t("close")}>
                  <X className="size-4" strokeWidth={ICON_STROKE} />
                </button>
              </div>

              <div className="p-5 sm:p-6">
              <div className="flex gap-2 mb-5 p-1 rounded-xl bg-muted">
                <button
                  type="button"
                  onClick={() => setAddMode("forward")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg transition-colors",
                    addMode === "forward" ? "bg-background text-foreground shadow-sm" : "text-foreground-secondary"
                  )}
                >
                  <PhoneForwarded className="size-4" strokeWidth={ICON_STROKE} /> {t("forwardMyNumber")}
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("new")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg transition-colors",
                    addMode === "new" ? "bg-background text-foreground shadow-sm" : "text-foreground-secondary"
                  )}
                >
                  <Plus className="size-4" strokeWidth={ICON_STROKE} /> {t("getNewNumber")}
                </button>
              </div>

              {addMode === "forward" ? (
                <div className="space-y-4">
                  <p className="text-sm text-foreground-secondary">{t("forwardDesc")}</p>
                  <div className="dashboard-panel-padded space-y-2">
                    <p className="text-xs font-medium text-foreground">{t("quickVersion")}</p>
                    <ol className="text-xs text-foreground-secondary space-y-1.5 list-decimal list-inside">
                      <li>{t("quickStep1")}</li>
                      <li>{t("quickStep2")}</li>
                      <li>{t("quickStep3")}</li>
                    </ol>
                  </div>
                  <Link
                    href="/dashboard/support"
                    className="btn-ghost text-sm w-full justify-center border border-border"
                  >
                    {t("supportLink")} <ArrowUpRight className="size-3.5" strokeWidth={ICON_STROKE} />
                  </Link>
                  <p className="text-xs text-foreground-secondary/70">{t("needNumberHint")}</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-foreground-secondary/70 mb-4">{t("newNumberDesc")}</p>
                  <div className="mb-6">
                    <label htmlFor="phone-area-code" className="text-xs text-foreground-secondary mb-1.5 block">{t("areaCode")}</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="phone-area-code"
                        type="text"
                        value={areaCode}
                        onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                        placeholder={t("areaCodePlaceholder")}
                        maxLength={3}
                        className="input flex-1"
                      />
                      <button
                        type="button"
                        onClick={searchNumbers}
                        disabled={areaCode.length < 3 || searching}
                        className="btn-primary"
                      >
                        <Search className="size-4" strokeWidth={ICON_STROKE} /> {searching ? "..." : t("search")}
                      </button>
                    </div>
                  </div>

                  {searching ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />
                      ))}
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-foreground-secondary mb-2">{t("numbersAvailable", { count: searchResults.length })}</p>
                      {searchResults.map((result) => (
                        <div key={result.phoneNumber} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-xl bg-muted border border-border">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{formatPhone(result.phoneNumber)}</p>
                            <p className="text-xs text-foreground-secondary">
                              {result.locality}, {result.region} • ${result.cost}/mo
                            </p>
                            <div className="flex gap-1 mt-1">
                              {(result.capabilities || []).map((cap) => (
                                <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-foreground-secondary">
                                  {cap}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => purchaseNumber(result.phoneNumber)}
                            disabled={purchasing === result.phoneNumber}
                            className="btn-primary text-xs px-3 py-1.5 w-full sm:w-auto shrink-0"
                          >
                            {purchasing === result.phoneNumber ? "..." : t("purchase")}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : areaCode.length >= 3 && !searching ? (
                    <EmptyState
                      icon={Phone}
                      title={t("noResults", { areaCode })}
                      description={t("noResultsDesc")}
                      iconVariant="muted"
                    />
                  ) : null}
                </>
              )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {confirmDialog}
    </DashboardPage>
  );
}
