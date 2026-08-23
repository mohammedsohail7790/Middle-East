"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Plus, X, ToggleLeft, ToggleRight, Play, Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { normalizeAutomationRule } from "@/lib/gateway-adapters";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { StatCard } from "@/components/ui-kit/StatCard";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { showDashboardToast } from "@/lib/dashboard-toast";
import { DASHBOARD_POLL_MS } from "@/lib/dashboard-sync";

interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  template: string;
  enabled: boolean;
  created_at: string;
  runs: number;
}

const TRIGGER_OPTIONS = [
  { value: "call_completed", label: "Call Completed" },
  { value: "missed_call", label: "Missed Call" },
  { value: "lead_created", label: "Lead Created" },
  { value: "appointment_set", label: "Appointment Booked" },
  { value: "appointment_reminder", label: "Appointment Reminder" },
];

const ACTION_OPTIONS = [
  { value: "send_email", label: "Send Email" },
  { value: "notify_team", label: "Notify Team" },
  { value: "create_task", label: "Create Task" },
];

const TRIGGER_LABELS: Record<string, string> = {
  call_completed: "Call Completed",
  call_ended: "Call Completed",
  missed_call: "Missed Call",
  lead_created: "Lead Created",
  appointment_set: "Appointment Booked",
  appointment_created: "Appointment Booked",
  appointment_reminder: "Appointment Reminder",
};

const ACTION_LABELS: Record<string, string> = {
  // Legacy SMS rules now deliver by email
  send_sms: "Send Email",
  send_email: "Send Email",
  notify_team: "Notify Team",
  create_task: "Create Task",
};

const DEFAULT_TEMPLATES: Record<string, string> = {
  send_email: "Subject: Your inquiry at {business}\n\nHi {name},\n\nThank you for reaching out. Our team will be in touch soon.",
  notify_team: "New {trigger} from {name} ({phone}). Check your Call IQ dashboard.",
  create_task: "Follow up with {name} — {trigger} on {date}",
};

export default function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [newRule, setNewRule] = useState({
    name: "",
    trigger: "call_completed",
    action: "send_email",
    template: DEFAULT_TEMPLATES.send_email,
    delay: 0,
  });
  const [creating, setCreating] = useState(false);

  const loadRules = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    api
      .get<AutomationRule[]>("/automation/rules")
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setRules(list.map((r) => normalizeAutomationRule(r as unknown as Record<string, unknown>) as AutomationRule));
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useRealtimeQuery(["settings", "config"], loadRules, "", {
    pollMs: DASHBOARD_POLL_MS,
    pollOnlyWhenDisconnected: true,
  });

  const toggleRule = async (rule: AutomationRule) => {
    setToggling(rule.id);
    const next = !rule.enabled;
    // Optimistic update
    setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: next } : r));
    try {
      await api.patch(`/automation/rules/${rule.id}/toggle`, { enabled: next });
      syncDashboardAction("config");
      showDashboardToast({
        type: "success",
        title: `Rule ${next ? "enabled" : "disabled"}`,
        message: `"${rule.name}" is now ${next ? "active" : "paused"}.`,
        durationMs: 3000,
      });
    } catch (e) {
      // Rollback
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: rule.enabled } : r));
      showDashboardToast({
        type: "error",
        title: "Toggle failed",
        message: e instanceof Error ? e.message : "Could not update rule",
      });
    } finally {
      setToggling(null);
    }
  };

  const createRule = async () => {
    if (!newRule.name.trim() || !newRule.trigger || !newRule.action) {
      showDashboardToast({ type: "error", title: "Missing fields", message: "Name, trigger and action are required." });
      return;
    }
    setCreating(true);
    try {
      const created = await api.post<AutomationRule>("/automation/rules", {
        name: newRule.name.trim(),
        trigger: newRule.trigger,
        action: newRule.action,
        template: newRule.template.trim() || DEFAULT_TEMPLATES[newRule.action] || "",
        delay: newRule.delay || 0,
      });
      setRules((prev) => [normalizeAutomationRule(created as unknown as Record<string, unknown>) as AutomationRule, ...prev]);
      setShowNewModal(false);
      setNewRule({ name: "", trigger: "call_completed", action: "send_email", template: DEFAULT_TEMPLATES.send_email, delay: 0 });
      syncDashboardAction("config");
      showDashboardToast({ type: "success", title: "Workflow created", message: `"${created.name}" is live.`, durationMs: 4000 });
    } catch (e) {
      showDashboardToast({ type: "error", title: "Create failed", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreating(false);
    }
  };

  const enabledCount = rules.filter((r) => r.enabled).length;
  const totalRuns = rules.reduce((s, r) => s + (r.runs ?? 0), 0);

  return (
    <DashboardPage
      title="Automation"
      description="Trigger SMS, email, and team alerts automatically after calls, leads, and appointments."
      loading={loading && rules.length === 0}
      error={error || undefined}
      actions={
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="btn-primary w-full sm:w-auto shrink-0 justify-center"
        >
          <Plus className="size-4" strokeWidth={ICON_STROKE} />
          New Workflow
        </button>
      }
    >
      <div className="dashboard-stat-grid dashboard-stat-grid--three">
        <StatCard label="Total workflows" value={rules.length} icon={Zap} iconVariant="accent" index={0} />
        <StatCard label="Active" value={enabledCount} icon={Play} iconVariant="success" index={1} />
        <StatCard label="Total runs" value={totalRuns} icon={Check} iconVariant="violet" index={2} />
      </div>

      <DashboardPageSection
        title="Workflows"
        description="Automations run after triggers — no code needed."
        icon={Zap}
        iconVariant="accent"
      >
        {rules.length === 0 && !loading ? (
          <EmptyState
            icon={Zap}
            title="No workflows yet"
            description="Create your first workflow to automatically follow up after calls, notify your team, or remind customers about appointments."
          />
        ) : (
          <div className="space-y-3">
            {rules.map((rule, i) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="dashboard-panel flex flex-col sm:flex-row sm:items-center gap-4 p-4"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <IconBox icon={Zap} variant={rule.enabled ? "accent" : "muted"} size="md" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{rule.name}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-muted text-muted-foreground">
                        {TRIGGER_LABELS[rule.trigger] ?? rule.trigger}
                      </span>
                      <span className="text-[10px] text-muted-foreground">→</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-accent/10 text-accent">
                        {ACTION_LABELS[rule.action] ?? rule.action}
                      </span>
                      {rule.runs > 0 && (
                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground">
                          {rule.runs} run{rule.runs !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {rule.template && (
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs">
                        {rule.template}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={toggling === rule.id}
                  onClick={() => void toggleRule(rule)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                    rule.enabled
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 hover:bg-emerald-100"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                  aria-label={rule.enabled ? "Disable workflow" : "Enable workflow"}
                >
                  {rule.enabled ? (
                    <ToggleRight className="size-4" strokeWidth={ICON_STROKE} />
                  ) : (
                    <ToggleLeft className="size-4" strokeWidth={ICON_STROKE} />
                  )}
                  {toggling === rule.id ? "Updating…" : rule.enabled ? "Active" : "Paused"}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </DashboardPageSection>

      {/* New Workflow Modal */}
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
              className="dashboard-modal-panel sm:max-w-lg !p-0"
            >
              <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6 border-b border-border">
                <div className="flex items-center gap-3 min-w-0">
                  <IconBox icon={Zap} variant="accent" size="sm" />
                  <h2 className="text-lg font-semibold text-foreground">New Workflow</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="dashboard-icon-btn !size-8"
                  aria-label="Close"
                >
                  <X className="size-4" strokeWidth={ICON_STROKE} />
                </button>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                <div>
                  <label htmlFor="workflow-name" className="dashboard-field-label">Workflow name *</label>
                  <input
                    id="workflow-name"
                    type="text"
                    value={newRule.name}
                    onChange={(e) => setNewRule((r) => ({ ...r, name: e.target.value }))}
                    placeholder="Follow-up after missed call"
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="workflow-trigger" className="dashboard-field-label">Trigger *</label>
                  <select
                    id="workflow-trigger"
                    value={newRule.trigger}
                    onChange={(e) => setNewRule((r) => ({ ...r, trigger: e.target.value }))}
                    className="input"
                  >
                    {TRIGGER_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="workflow-action" className="dashboard-field-label">Action *</label>
                  <select
                    id="workflow-action"
                    value={newRule.action}
                    onChange={(e) =>
                      setNewRule((r) => ({
                        ...r,
                        action: e.target.value,
                        template: DEFAULT_TEMPLATES[e.target.value] ?? "",
                      }))
                    }
                    className="input"
                  >
                    {ACTION_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="workflow-template" className="dashboard-field-label">Message template</label>
                  <textarea
                    id="workflow-template"
                    rows={3}
                    value={newRule.template}
                    onChange={(e) => setNewRule((r) => ({ ...r, template: e.target.value }))}
                    placeholder="Use {name}, {phone}, {business}, {date} as variables"
                    className="input resize-none"
                  />
                  <p className="dashboard-field-hint">Variables: {"{name}"} {"{phone}"} {"{business}"} {"{date}"} {"{trigger}"}</p>
                </div>
                <div>
                  <label htmlFor="workflow-delay" className="dashboard-field-label">Delay (minutes after trigger)</label>
                  <input
                    id="workflow-delay"
                    type="number"
                    min={0}
                    max={1440}
                    value={newRule.delay}
                    onChange={(e) => setNewRule((r) => ({ ...r, delay: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                    placeholder="0"
                    className="input"
                  />
                  <p className="dashboard-field-hint">0 = immediate. Max 1440 minutes (24 hours).</p>
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <button type="button" onClick={() => setShowNewModal(false)} className="btn-ghost flex-1">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void createRule()}
                    disabled={creating || !newRule.name.trim()}
                    className="btn-primary flex-1"
                  >
                    {creating ? "Creating…" : "Create Workflow"}
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
