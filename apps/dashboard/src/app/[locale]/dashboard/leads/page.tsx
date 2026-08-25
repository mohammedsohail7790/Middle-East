"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, X, Star, TrendingUp, Search, User,
  UserPlus, Phone, Calendar, Trophy, XCircle, Target, Activity,
} from "lucide-react";
import { IconBox, ICON_STROKE, type IconBoxVariant } from "@/components/ui-kit/IconBox";
import { StatCard } from "@/components/ui-kit/StatCard";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { api, asArray } from "@/lib/api";
import { readApiGetCache } from "@/lib/api-get-cache";
import { normalizeLead } from "@/lib/gateway-adapters";
import { cn, formatPhone } from "@/lib/utils";
import { DASHBOARD_POLL_MS, subscribeDashboardSync } from "@/lib/dashboard-sync";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

const COLUMN_DEFS: {
  id: string;
  labelKey: "new" | "contacted" | "qualified" | "appointment_set" | "won" | "lost";
  icon: typeof UserPlus;
  iconVariant: IconBoxVariant;
}[] = [
  { id: "new", labelKey: "new", icon: UserPlus, iconVariant: "accent" },
  { id: "contacted", labelKey: "contacted", icon: Phone, iconVariant: "muted" },
  { id: "qualified", labelKey: "qualified", icon: Star, iconVariant: "violet" },
  { id: "appointment_set", labelKey: "appointment_set", icon: Calendar, iconVariant: "warning" },
  { id: "won", labelKey: "won", icon: Trophy, iconVariant: "success" },
  { id: "lost", labelKey: "lost", icon: XCircle, iconVariant: "error" },
];

interface Lead {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
  status: string;
  score: number;
  source: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

function initialLeads(): Lead[] {
  const cached = readApiGetCache<Lead[] | { items?: Lead[] }>("/leads?limit=500&offset=0");
  if (Array.isArray(cached)) {
    return cached.map((row) => normalizeLead(row as unknown as Record<string, unknown>) as Lead);
  }
  if (cached && typeof cached === "object" && Array.isArray((cached as { items?: Lead[] }).items)) {
    return (cached as { items: Lead[] }).items.map(
      (row) => normalizeLead(row as unknown as Record<string, unknown>) as Lead
    );
  }
  return [];
}

export default function LeadsPage() {
  const t = useTranslations("pages.leads");
  const tCommon = useTranslations("common");
  const { title } = useDashboardPageLabels("/dashboard/leads");
  const columns = useMemo(
    () =>
      COLUMN_DEFS.map((col) => ({
        ...col,
        label: t(`columns.${col.labelKey}`),
      })),
    [t]
  );
  const pathname = usePathname();
  const [leads, setLeads] = useState<Lead[]>(() => initialLeads());
  const [loading, setLoading] = useState(() => initialLeads().length === 0);
  const [error, setError] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [newLead, setNewLead] = useState({ phoneNumber: "", source: "", name: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);
  const [mobileColumn, setMobileColumn] = useState(COLUMN_DEFS[0].id);

  const loadLeads = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const params = new URLSearchParams({ limit: "500", offset: "0" });
    if (leadSearch.trim()) params.set("search", leadSearch.trim());
    api
      .get<Lead[]>(`/leads?${params.toString()}`)
      .then((data) =>
        setLeads(asArray(data).map((row) => normalizeLead(row as Record<string, unknown>) as Lead))
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [leadSearch]);

  useRealtimeQuery(["leads"], loadLeads, leadSearch, {
    pollMs: DASHBOARD_POLL_MS,
    pollOnlyWhenDisconnected: true,
  });

  const refreshDetailLead = useCallback(() => {
    if (!detailLeadId) return;
    api
      .get<Record<string, unknown>>(`/leads/${detailLeadId}`)
      .then((row) => setDetailLead(normalizeLead(row) as Lead))
      .catch(() => {
        const fromList = leads.find((l) => l.id === detailLeadId);
        if (fromList) setDetailLead(fromList);
      });
  }, [detailLeadId, leads]);

  useEffect(() => {
    if (!detailLeadId) {
      setDetailLead(null);
      return;
    }
    refreshDetailLead();
  }, [detailLeadId, refreshDetailLead]);

  useEffect(() => {
    if (!detailLeadId) return;
    return subscribeDashboardSync((scopes) => {
      if (scopes.includes("leads")) refreshDetailLead();
    });
  }, [detailLeadId, refreshDetailLead]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const leadId = new URLSearchParams(window.location.search).get("lead");
    if (leadId) setDetailLeadId(leadId);
  }, [pathname]);

  const saveDetailLead = async () => {
    if (!detailLead) return;
    setDetailSaving(true);
    setError("");
    try {
      const updated = await api.put<Record<string, unknown>>(`/leads/${detailLead.id}`, {
        name: detailLead.name || undefined,
        email: detailLead.email || undefined,
        phoneNumber: detailLead.phoneNumber,
        source: detailLead.source || undefined,
        metadata: { ...(detailLead.metadata || {}), ...(detailLead.email ? { email: detailLead.email } : {}) },
      });
      const normalized = normalizeLead(updated) as Lead;
      setDetailLead(normalized);
      setLeads((list) => list.map((l) => (l.id === normalized.id ? normalized : l)));
      syncDashboardAction("leads");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save lead");
    } finally {
      setDetailSaving(false);
    }
  };

  const updateDetailStatus = async (status: string) => {
    if (!detailLead || detailLead.status === status) return;
    const prev = detailLead.status;
    setDetailSaving(true);
    setDetailLead({ ...detailLead, status });
    setLeads((list) => list.map((l) => (l.id === detailLead.id ? { ...l, status } : l)));
    try {
      await api.patch(`/leads/${detailLead.id}/status`, { status });
      syncDashboardAction("leads");
    } catch (e: unknown) {
      setDetailLead({ ...detailLead, status: prev });
      setLeads((list) => list.map((l) => (l.id === detailLead.id ? { ...l, status: prev } : l)));
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedLead || draggedLead.status === columnId) return;

    const prevStatus = draggedLead.status;
    setLeads((prev) =>
      prev.map((l) => (l.id === draggedLead.id ? { ...l, status: columnId } : l))
    );

    try {
      await api.patch(`/leads/${draggedLead.id}/status`, { status: columnId });
      syncDashboardAction("leads");
    } catch (e: unknown) {
      setLeads((prev) =>
        prev.map((l) => (l.id === draggedLead.id ? { ...l, status: prevStatus } : l))
      );
      setError(e instanceof Error ? e.message : "Failed to move lead");
    }
    setDraggedLead(null);
  };

  const createLead = async () => {
    if (!newLead.phoneNumber) return;
    setSubmitting(true);
    try {
      const payload = {
        ...newLead,
        source: newLead.source?.trim() || "dashboard",
      };
      const created = await api.post<Record<string, unknown>>("/leads", payload);
      setLeads((prev) => [...prev, normalizeLead(created) as Lead]);
      setShowNewModal(false);
      setNewLead({ phoneNumber: "", source: "", name: "", email: "" });
      syncDashboardAction("leads");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create lead");
    } finally {
      setSubmitting(false);
    }
  };

  const totalLeads = leads.length;
  const wonLeads = leads.filter((l) => l.status === "won").length;
  const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  const getScoreBadge = (score: number) => {
    if (score >= 80) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
    if (score >= 50) return "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    return "bg-muted text-foreground-secondary";
  };

  return (
    <DashboardPage
      title={title}
      description={t("description")}
      loading={loading && leads.length === 0}
      error={error || undefined}
      actions={
        <button onClick={() => setShowNewModal(true)} className="btn-primary w-full sm:w-auto shrink-0 justify-center">
          <Plus className="size-4" strokeWidth={ICON_STROKE} /> {t("newLead")}
        </button>
      }
      toolbar={
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" strokeWidth={ICON_STROKE} />
          <input
            type="search"
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="input w-full pl-10"
            aria-label="Search leads"
          />
        </div>
      }
    >
      <div className="dashboard-stat-grid">
        <StatCard label={t("totalLeads")} value={totalLeads} icon={Users} iconVariant="accent" index={0} />
        <StatCard label={t("conversion")} value={`${conversionRate}%`} icon={Target} iconVariant="success" index={1} />
        <StatCard label={t("won")} value={wonLeads} icon={Trophy} iconVariant="success" index={2} />
        <StatCard
          label={t("active")}
          value={leads.filter((l) => !["won", "lost"].includes(l.status)).length}
          icon={Activity}
          iconVariant="violet"
          index={3}
        />
      </div>

      <DashboardPageSection
        step="Pipeline"
        title={t("stagesTitle")}
        description={t("stagesDesc")}
        icon={Users}
        iconVariant="accent"
      >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="min-w-0"
      >
        {loading ? (
          <div className="dashboard-kanban-track">
            {columns.map((col) => (
              <div key={col.id} className="dashboard-kanban-column dashboard-panel p-3 sm:p-4">
                <div className="h-10 w-full bg-muted animate-pulse rounded-xl mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : totalLeads === 0 ? (
          <EmptyState
            icon={Users}
            title={t("noLeads")}
            description="New leads from calls, SMS, and manual entry will appear in your pipeline."
          />
        ) : (
          <>
          <div className="lg:hidden space-y-3 sm:space-y-4">
            <div className="dashboard-pipeline-tabs" role="tablist" aria-label="Pipeline stage">
              {columns.map((col) => {
                const count = leads.filter((l) => l.status === col.id).length;
                const active = mobileColumn === col.id;
                return (
                  <button
                    key={col.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setMobileColumn(col.id)}
                    className={cn("dashboard-pipeline-tab", active && "is-active")}
                  >
                    <IconBox icon={col.icon} variant={col.iconVariant} size="sm" />
                    <span>{col.label}</span>
                    <span className="dashboard-tab-count">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              {leads
                .filter((l) => l.status === mobileColumn)
                .map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setDetailLeadId(lead.id)}
                    className="dashboard-mobile-card w-full text-left"
                  >
                    <div className="flex items-start gap-3">
                      <IconBox icon={User} variant="violet" size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{lead.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatPhone(lead.phoneNumber)}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={cn("px-2 py-0.5 text-[10px] rounded-full font-medium", getScoreBadge(lead.score))}>
                            Score {lead.score}
                          </span>
                          {lead.source && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground">
                              {lead.source}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              {leads.filter((l) => l.status === mobileColumn).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">{t("noLeadsStage")}</p>
              )}
            </div>
          </div>

          <div className="hidden lg:block dashboard-kanban-shell">
          <div className="dashboard-kanban-track">
            {columns.map((col) => {
              const columnLeads = leads.filter((l) => l.status === col.id);
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.id)}
                  className={cn(
                    "dashboard-kanban-column dashboard-panel flex flex-col p-3 sm:p-4",
                    dragOverColumn === col.id && "ring-2 ring-accent/30 bg-accent/[0.02]"
                  )}
                  style={{ transition: "box-shadow 160ms ease-out, background-color 160ms ease-out" }}
                >
                  <div className="flex items-center gap-2.5 mb-4 min-w-0">
                    <IconBox icon={col.icon} variant={col.iconVariant} size="sm" />
                    <span className="text-sm font-medium text-foreground truncate">{col.label}</span>
                    <span className="dashboard-tab-count ml-auto">{columnLeads.length}</span>
                  </div>
                  <div className="space-y-2 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                    {columnLeads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        role="button"
                        tabIndex={0}
                        aria-label={`${lead.name || "Unknown"}, ${formatPhone(lead.phoneNumber)}, score ${lead.score}. Press Enter to view details.`}
                        onDragStart={(e) => handleDragStart(e, lead)}
                        onClick={() => setDetailLeadId(lead.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDetailLeadId(lead.id);
                          }
                        }}
                        className="rounded-xl border border-border bg-card p-3 cursor-grab active:cursor-grabbing card-hover group"
                      >
                        <div className="flex items-start gap-2.5">
                          <IconBox icon={User} variant="violet" size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{lead.name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground truncate">{formatPhone(lead.phoneNumber)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={cn("px-1.5 py-0.5 text-[10px] rounded-full font-medium", getScoreBadge(lead.score))}>
                            {lead.score}
                          </span>
                          {lead.source && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-muted text-foreground-secondary">
                              {lead.source}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
          </>
        )}
      </motion.div>
      </DashboardPageSection>

      {/* New Lead Modal */}
      <AnimatePresence>
        {showNewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="dashboard-modal-overlay"
            onClick={() => setShowNewModal(false)}
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
                  <IconBox icon={UserPlus} variant="accent" size="sm" />
                  <h2 className="text-lg font-semibold text-foreground truncate">New Lead</h2>
                </div>
                <button type="button" onClick={() => setShowNewModal(false)} className="dashboard-icon-btn !size-8" aria-label="Close">
                  <X className="size-4" strokeWidth={ICON_STROKE} />
                </button>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                <div>
                  <label className="dashboard-field-label" htmlFor="new-lead-name">Name</label>
                  <input
                    id="new-lead-name"
                    type="text"
                    value={newLead.name}
                    onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                    placeholder="John Doe"
                    className="input"
                  />
                </div>
                <div>
                  <label className="dashboard-field-label" htmlFor="new-lead-phone">Phone number *</label>
                  <input
                    id="new-lead-phone"
                    type="tel"
                    value={newLead.phoneNumber}
                    onChange={(e) => setNewLead({ ...newLead, phoneNumber: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="input"
                  />
                </div>
                <div>
                  <label className="dashboard-field-label" htmlFor="new-lead-email">Email</label>
                  <input
                    id="new-lead-email"
                    type="email"
                    value={newLead.email}
                    onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                    placeholder="john@example.com"
                    className="input"
                  />
                </div>
                <div>
                  <label className="dashboard-field-label" htmlFor="new-lead-source">Source</label>
                  <select
                    id="new-lead-source"
                    value={newLead.source}
                    onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                    className="input"
                  >
                    <option value="">Select source...</option>
                    <option value="phone">Phone Call</option>
                    <option value="website">Website</option>
                    <option value="referral">Referral</option>
                    <option value="google">Google Ads</option>
                    <option value="facebook">Facebook</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <button type="button" onClick={() => setShowNewModal(false)} className="btn-ghost flex-1">Cancel</button>
                  <button type="button" onClick={createLead} disabled={!newLead.phoneNumber || submitting} className="btn-primary flex-1">
                    {submitting ? "Creating..." : "Create Lead"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lead Detail Modal */}
      <AnimatePresence>
        {detailLead && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="dashboard-modal-overlay"
            onClick={() => setDetailLeadId(null)}
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
                  <IconBox icon={User} variant="violet" size="md" />
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-foreground truncate">{detailLead.name || "Lead details"}</h2>
                    <p className="text-xs text-muted-foreground truncate">{detailLead.source || "No source"}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setDetailLeadId(null)} className="dashboard-icon-btn !size-8" aria-label="Close">
                  <X className="size-4" strokeWidth={ICON_STROKE} />
                </button>
              </div>
              <div className="space-y-3 p-5 sm:p-6">
                <div>
                  <label className="dashboard-field-label" htmlFor="detail-lead-name">Name</label>
                  <input
                    id="detail-lead-name"
                    className="input w-full text-sm"
                    value={detailLead.name || ""}
                    onChange={(e) => setDetailLead({ ...detailLead, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="dashboard-field-label" htmlFor="detail-lead-phone">Phone</label>
                  <input
                    id="detail-lead-phone"
                    className="input w-full text-sm"
                    value={detailLead.phoneNumber}
                    onChange={(e) => setDetailLead({ ...detailLead, phoneNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="dashboard-field-label" htmlFor="detail-lead-email">Email</label>
                  <input
                    id="detail-lead-email"
                    type="email"
                    className="input w-full text-sm"
                    value={detailLead.email || ""}
                    onChange={(e) => setDetailLead({ ...detailLead, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="dashboard-field-label" htmlFor="detail-lead-source">Source</label>
                  <select
                    id="detail-lead-source"
                    className="input w-full text-sm"
                    value={detailLead.source || ""}
                    onChange={(e) => setDetailLead({ ...detailLead, source: e.target.value })}
                  >
                    <option value="">No source</option>
                    <option value="phone">Phone Call</option>
                    <option value="website">Website</option>
                    <option value="referral">Referral</option>
                    <option value="google">Google Ads</option>
                    <option value="facebook">Facebook</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Star className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
                  <span className="text-foreground-secondary">Score:</span>
                  <span className={cn("px-2 py-0.5 text-xs rounded-full", getScoreBadge(detailLead.score))}>
                    {detailLead.score}
                  </span>
                </div>
                <div className="space-y-2">
                  <label className="dashboard-field-label flex items-center gap-2" htmlFor="detail-lead-status">
                    <TrendingUp className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
                    Status
                  </label>
                  <select
                    id="detail-lead-status"
                    value={detailLead.status}
                    disabled={detailSaving}
                    onChange={(e) => void updateDetailStatus(e.target.value)}
                    className="input w-full text-sm"
                  >
                    {columns.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
                  <button type="button" onClick={() => setDetailLeadId(null)} className="btn-ghost flex-1">
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveDetailLead()}
                    disabled={detailSaving}
                    className="btn-primary flex-1"
                  >
                    {detailSaving ? "Saving…" : "Save"}
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
