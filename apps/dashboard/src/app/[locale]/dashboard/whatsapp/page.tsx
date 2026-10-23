"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, Send, Bot, UserRound, Unplug, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { subscribeDashboardSync } from "@/lib/dashboard-sync";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

interface Status {
  connected: boolean;
  number: { displayPhone: string | null; phoneNumberId: string; aiEnabled: boolean; status: string; lastError: string | null } | null;
  notifyCallers: boolean;
  webhookUrl: string;
  platformReady: boolean;
}
interface Conversation {
  id: string;
  customerPhone: string;
  customerName: string | null;
  mode: "ai" | "human";
  needsAttention: boolean;
  optedOut: boolean;
  lastMessageAt: string;
  preview: string | null;
  windowOpen: boolean;
}
interface Message {
  id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "ai" | "staff" | "system";
  body: string | null;
  status: string;
  templateName: string | null;
  createdAt: string;
}

const INPUT = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";
const BTN = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50";

function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{help}</span>
      </span>
    </label>
  );
}

export default function WhatsAppPage() {
  const t = useTranslations("pages.whatsapp");
  const { title, description } = useDashboardPageLabels("/dashboard/whatsapp");

  const [status, setStatus] = useState<Status | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<{ conversation: Conversation; messages: Message[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [form, setForm] = useState({ phoneNumberId: "", accessToken: "", wabaId: "" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.get<Status>("/channels/whatsapp", { fresh: true }));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadConvs = useCallback(async () => {
    try {
      setConvs(await api.get<Conversation[]>("/channels/whatsapp/conversations", { fresh: true }));
    } catch {
      /* keep the last list; the next poll retries */
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      setThread(await api.get<{ conversation: Conversation; messages: Message[] }>(`/channels/whatsapp/conversations/${id}/messages`, { fresh: true }));
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const connected = !!status?.connected;
  useEffect(() => {
    if (!connected) return;
    const tick = () => { void loadConvs(); if (selected) void loadThread(selected); };
    tick();
    const timer = setInterval(tick, 10_000);
    const unsub = subscribeDashboardSync((scopes) => { if (scopes.includes("whatsapp")) tick(); });
    return () => { clearInterval(timer); unsub(); };
  }, [connected, selected, loadConvs, loadThread]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [thread?.messages.length]);

  async function connect() {
    setBusy(true);
    setFormError(null);
    try {
      await api.put("/channels/whatsapp/connect", {
        phoneNumberId: form.phoneNumberId.trim(),
        ...(form.wabaId.trim() ? { wabaId: form.wabaId.trim() } : {}),
        ...(form.accessToken.trim() ? { accessToken: form.accessToken.trim() } : {}),
      });
      setForm({ phoneNumberId: "", accessToken: "", wabaId: "" });
      await loadStatus();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t("connectFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm(t("disconnectConfirm"))) return;
    await api.del("/channels/whatsapp");
    setSelected(null); setThread(null); setConvs([]);
    await loadStatus();
  }

  async function saveSetting(patch: { aiEnabled?: boolean; notifyCallers?: boolean }) {
    setStatus((s) => s && { ...s, notifyCallers: patch.notifyCallers ?? s.notifyCallers, number: s.number && { ...s.number, aiEnabled: patch.aiEnabled ?? s.number.aiEnabled } });
    try { await api.patch("/channels/whatsapp/settings", patch); } catch { await loadStatus(); }
  }

  async function send() {
    if (!selected || !draft.trim()) return;
    setSendError(null);
    try {
      await api.post(`/channels/whatsapp/conversations/${selected}/messages`, { text: draft.trim() });
      setDraft("");
      await Promise.all([loadThread(selected), loadConvs()]);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : t("sendFailed"));
    }
  }

  async function setMode(mode: "ai" | "human") {
    if (!selected) return;
    await api.post(`/channels/whatsapp/conversations/${selected}/mode`, { mode });
    await Promise.all([loadThread(selected), loadConvs()]);
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

  return (
    <DashboardPage title={title} description={description} loading={loading} error={error} onRetry={() => void loadStatus()}>
      {!connected ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-semibold">{t("connectTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("connectIntro")}</p>
            <label className="block text-sm">
              <span className="font-medium">{t("phoneNumberId")}</span>
              <input className={cn(INPUT, "mt-1")} inputMode="numeric" value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} />
              <span className="text-xs text-muted-foreground">{t("phoneNumberIdHelp")}</span>
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("accessToken")}</span>
              <input className={cn(INPUT, "mt-1")} type="password" autoComplete="off" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} />
              <span className="text-xs text-muted-foreground">{t("accessTokenHelp")}</span>
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("wabaId")}</span>
              <input className={cn(INPUT, "mt-1")} inputMode="numeric" value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} />
            </label>
            {formError && <p className="text-sm text-red-500 flex items-center gap-1.5"><AlertTriangle className="size-4" />{formError}</p>}
            <button className={cn(BTN, "bg-accent text-accent-foreground")} disabled={busy || !form.phoneNumberId.trim()} onClick={() => void connect()}>
              {busy ? t("connecting") : t("connect")}
            </button>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-semibold">{t("webhookTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("webhookHelp")}</p>
            <code className="block break-all rounded-lg bg-muted px-3 py-2 text-xs" dir="ltr">{status?.webhookUrl}</code>
            <p className="text-xs text-muted-foreground">{t("verifyTokenHelp")}</p>
            {status && !status.platformReady && <p className="text-sm text-amber-600 flex items-center gap-1.5"><AlertTriangle className="size-4" />{t("platformNotReady")}</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 grid gap-5 md:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">{t("connectedAs")}</p>
                <p className="font-semibold" dir="ltr">{status?.number?.displayPhone || status?.number?.phoneNumberId}</p>
                {status?.number?.status === "error" && <p className="text-sm text-red-500 mt-1">{status.number.lastError || t("numberError")}</p>}
              </div>
              <Toggle checked={status?.number?.aiEnabled ?? true} onChange={(v) => void saveSetting({ aiEnabled: v })} label={t("aiReplies")} help={t("aiRepliesHelp")} />
              <Toggle checked={status?.notifyCallers ?? false} onChange={(v) => void saveSetting({ notifyCallers: v })} label={t("notifyCallers")} help={t("notifyCallersHelp")} />
            </div>
            <div className="self-start">
              <button className={cn(BTN, "border border-border text-muted-foreground hover:text-foreground")} onClick={() => void disconnect()}>
                <Unplug className="size-4" />{t("disconnect")}
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[22rem_1fr] min-h-[28rem]">
            <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-border font-medium text-sm">{t("conversations")}</div>
              <div className="overflow-y-auto flex-1 max-h-[34rem]">
                {convs.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("noConversations")}</p>}
                {convs.map((c) => (
                  <button key={c.id} onClick={() => { setSelected(c.id); void loadThread(c.id); }}
                    className={cn("w-full text-start px-4 py-3 border-b border-border/60 hover:bg-muted/50", selected === c.id && "bg-muted")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate" dir="ltr">{c.customerName || c.customerPhone}</span>
                      {c.needsAttention && <span className="shrink-0 rounded-full bg-amber-500/15 text-amber-600 text-[10px] px-2 py-0.5">{t("needsAttention")}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{c.preview ?? ""}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{fmt(c.lastMessageAt)} · {c.mode === "ai" ? t("aiHandling") : t("staffHandling")}{c.optedOut ? ` · ${t("optedOut")}` : ""}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card flex flex-col overflow-hidden">
              {!thread ? (
                <EmptyState icon={MessageCircle} title={t("pickConversation")} />
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                    <span className="font-medium text-sm" dir="ltr">{thread.conversation.customerName || thread.conversation.customerPhone}</span>
                    {thread.conversation.mode === "ai" ? (
                      <button className={cn(BTN, "border border-border")} onClick={() => void setMode("human")}><UserRound className="size-4" />{t("takeOver")}</button>
                    ) : (
                      <button className={cn(BTN, "border border-border")} onClick={() => void setMode("ai")}><Bot className="size-4" />{t("handBack")}</button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[28rem]">
                    {thread.messages.map((m) => (
                      <div key={m.id} className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                          m.direction === "outbound" ? "bg-accent text-accent-foreground" : "bg-muted",
                          m.status === "failed" && "ring-1 ring-red-500")}>
                          {m.body}
                          <div className="text-[10px] opacity-70 mt-1">
                            {m.direction === "outbound" ? t(`sender.${m.sender}`) : ""} {fmt(m.createdAt)}{m.status === "failed" ? ` · ${t("failed")}` : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                  <div className="border-t border-border p-3 space-y-2">
                    {!thread.conversation.windowOpen && <p className="text-xs text-amber-600">{t("windowClosed")}</p>}
                    {sendError && <p className="text-xs text-red-500">{sendError}</p>}
                    <div className="flex gap-2">
                      <input className={INPUT} value={draft} placeholder={t("typeReply")} disabled={!thread.conversation.windowOpen}
                        onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} />
                      <button className={cn(BTN, "bg-accent text-accent-foreground")} disabled={!draft.trim() || !thread.conversation.windowOpen} onClick={() => void send()}>
                        <Send className="size-4 rtl:-scale-x-100" />{t("send")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardPage>
  );
}
