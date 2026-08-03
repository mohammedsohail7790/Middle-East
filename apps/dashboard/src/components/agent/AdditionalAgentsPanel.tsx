"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Bot, Plus, Save, Trash2, Lock, Pencil, X } from "lucide-react";
import { api } from "@/lib/api";
import { hasAccess, subscribePlanUpdates } from "@/lib/store";
import { useDashboardSync } from "@/lib/dashboard-sync";
import { syncDashboardAction } from "@/lib/dashboard-actions";

interface Agent {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  voiceId: string;
  tone: string;
}

const EMPTY_FORM = {
  name: "",
  role: "receptionist",
  systemPrompt: "",
  voiceId: "coral",
  tone: "professional",
};

export function AdditionalAgentsPanel() {
  const [planTick, setPlanTick] = useState(0);
  useEffect(() => subscribePlanUpdates(() => setPlanTick((n) => n + 1)), []);
  void planTick;
  const locked = !hasAccess("professional");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const load = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    api
      .get<Agent[]>("/ivr/agents")
      .then((rows) =>
        setAgents(
          (Array.isArray(rows) ? (rows as unknown as Record<string, unknown>[]) : []).map((r) => ({
            id: String(r.id),
            name: String(r.name),
            role: String(r.role),
            systemPrompt: String(r.systemPrompt ?? r.system_prompt ?? ""),
            voiceId: String(r.voiceId ?? r.voice_id ?? "coral"),
            tone: String(r.tone ?? "professional"),
          }))
        )
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!locked) load();
    else setLoading(false);
  }, [locked, load]);

  useDashboardSync(["config", "phone"], () => void load({ silent: true }));

  const createAgent = async () => {
    setError("");
    try {
      await api.post("/ivr/agents", {
        name: form.name.trim(),
        role: form.role,
        systemPrompt: form.systemPrompt.trim(),
        voiceId: form.voiceId,
        tone: form.tone,
      });
      setForm(EMPTY_FORM);
      load();
      syncDashboardAction("config");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create agent");
    }
  };

  const startEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setEditForm({
      name: agent.name,
      role: agent.role,
      systemPrompt: agent.systemPrompt,
      voiceId: agent.voiceId,
      tone: agent.tone,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError("");
    try {
      await api.put(`/ivr/agents/${editingId}`, {
        name: editForm.name.trim(),
        role: editForm.role,
        systemPrompt: editForm.systemPrompt.trim(),
        voiceId: editForm.voiceId,
        tone: editForm.tone,
      });
      setEditingId(null);
      load();
      syncDashboardAction("config");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update agent");
    }
  };

  const removeAgent = async (id: string) => {
    try {
      await api.del(`/ivr/agents/${id}`);
      if (editingId === id) setEditingId(null);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      syncDashboardAction("config");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const canCreate = form.name.trim().length > 0 && form.systemPrompt.trim().length > 0;

  if (locked) {
    return (
      <div className="card p-8 text-center">
        <Lock className="w-8 h-8 text-amber-700 mx-auto mb-3" />
        <p className="text-sm text-foreground-secondary mb-4">
          Multiple agents per phone number requires the Professional plan.
        </p>
        <Link href="/dashboard/billing" className="btn-primary text-sm">
          Upgrade plan
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-foreground-secondary">
        Create specialized agents, then assign them on{" "}
        <Link href="/dashboard/phone-numbers" className="text-accent font-medium hover:underline">
          Phone Numbers
        </Link>
        .
      </p>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="card p-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" /> New agent
        </h2>
        <div className="grid gap-3">
          <input
            className="input"
            placeholder="Name (e.g. Sales — Mike)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="receptionist">Receptionist</option>
            <option value="sales">Sales</option>
            <option value="support">Support</option>
            <option value="billing">Billing</option>
          </select>
          <textarea
            className="input resize-none"
            rows={4}
            placeholder="System instructions (required) — how this agent should handle calls..."
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          />
          <button type="button" onClick={createAgent} className="btn-primary w-fit" disabled={!canCreate}>
            <Save className="w-4 h-4" /> Create agent
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-foreground-secondary">Loading...</p>
      ) : (
        <div className="space-y-3">
          {agents.map((a) => (
            <div key={a.id} className="card p-4">
              {editingId === a.id ? (
                <div className="space-y-3">
                  <input
                    className="input"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                  <select
                    className="input"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    <option value="receptionist">Receptionist</option>
                    <option value="sales">Sales</option>
                    <option value="support">Support</option>
                    <option value="billing">Billing</option>
                  </select>
                  <textarea
                    className="input resize-none"
                    rows={4}
                    value={editForm.systemPrompt}
                    onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      className="btn-primary text-sm"
                      disabled={!editForm.name.trim() || !editForm.systemPrompt.trim()}
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn-ghost text-sm">
                      <X className="w-4 h-4" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <Bot className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">{a.name}</p>
                      <p className="text-xs text-foreground-secondary capitalize">
                        {a.role} · voice {a.voiceId}
                      </p>
                      <p className="text-xs text-foreground-tertiary mt-1 line-clamp-2">{a.systemPrompt}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      className="text-foreground-tertiary hover:text-accent p-1"
                      aria-label="Edit agent"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAgent(a.id)}
                      className="text-foreground-tertiary hover:text-red-600 p-1"
                      aria-label="Delete agent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!agents.length && <p className="text-sm text-foreground-secondary">No additional agents yet.</p>}
        </div>
      )}
    </div>
  );
}
