"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, Send, Bot, UserRound, Unplug, AlertTriangle, CreditCard } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { subscribeDashboardSync } from "@/lib/dashboard-sync";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";
import { EmbeddedSignupButton } from "@/components/whatsapp-embedded-signup";

interface Status {
  connected: boolean;
  number: { displayPhone: string | null; phoneNumberId: string; aiEnabled: boolean; status: string; lastError: string | null } | null;
  notifyCallers: boolean;
  webhookUrl: string;
  platformReady: boolean;
  embeddedSignup?: { appId: string; configId: string } | null;
  paymentsConnected?: boolean;
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
interface Stats {
  days: number; newConversations: number; needingAttention: number; optedOut: number;
  inboundMessages: number; aiReplies: number; staffReplies: number; remindersAndConfirmations: number; bookingsFromWhatsAppContacts: number;
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<{ conversation: Conversation; messages: Message[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [form, setForm] = useState({ phoneNumberId: "", accessToken: "", wabaId: "" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [stripeKey, setStripeKey] = useState("");
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", currency: "aed", description: "" });
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
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

  const loadStats = useCallback(async () => {
    try {
      setStats(await api.get<Stats>("/channels/whatsapp/stats?days=30", { fresh: true }));
    } catch {
      /* the report is optional; the inbox still works */
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
    const tick = () => { void loadConvs(); void loadStats(); if (selected) void loadThread(selected); };
    tick();
    const timer = setInterval(tick, 10_000);
    const unsub = subscribeDashboardSync((scopes) => { if (scopes.includes("whatsapp")) tick(); });
    return () => { clearInterval(timer); unsub(); };
  }, [connected, selected, loadConvs, loadStats, loadThread]);

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

  async function saveStripeKey() {
    setStripeBusy(true);
    setStripeError(null);
    try {
      await api.put("/channels/whatsapp/payments", { stripeKey: stripeKey.trim() });
      setStripeKey("");
      await loadStatus();
    } catch (e) {
      setStripeError(e instanceof Error ? e.message : t("payments.keyFailed"));
    } finally {
      setStripeBusy(false);
    }
  }

  async function removeStripeKey() {
    if (!window.confirm(t("payments.removeConfirm"))) return;
    await api.del("/channels/whatsapp/payments");
    await loadStatus();
  }

  async function sendPaymentLink() {
    if (!selected) return;
    setPayBusy(true);
    setPayError(null);
    try {
      await api.post(`/channels/whatsapp/conversations/${selected}/payment-link`, {
        amount: Number(pay.amount), currency: pay.currency, description: pay.description.trim(),
      });
      setPay({ amount: "", currency: pay.currency, description: "" });
      setPayOpen(false);
      await Promise.all([loadThread(selected), loadConvs()]);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : t("payments.failed"));
    } finally {
      setPayBusy(false);
    }
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
            {status?.embeddedSignup && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t("connectWithFacebookHelp")}</p>
                <EmbeddedSignupButton
                  appId={status.embeddedSignup.appId}
                  configId={status.embeddedSignup.configId}
                  onConnected={loadStatus}
                  onError={setFormError}
                  label={t("connectWithFacebook")}
                  failedMessage={t("signupFailed")}
                  className={cn(BTN, "bg-accent text-accent-foreground")}
                />
                <p className="text-xs text-muted-foreground pt-2">{t("orPaste")}</p>
              </div>
            )}
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
            <div className="space-y-2 min-w-[16rem] max-w-md">
              <div className="text-sm font-medium flex items-center gap-1.5"><CreditCard className="size-4" />{t("payments.title")}</div>
              {status?.paymentsConnected ? (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-emerald-600">{t("payments.connected")}</span>
                  <button className={cn(BTN, "border border-border text-muted-foreground hover:text-foreground")} onClick={() => void removeStripeKey()}>{t("payments.remove")}</button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">{t("payments.help")}</p>
                  <input className={INPUT} type="password" autoComplete="off" placeholder={t("payments.keyLabel")} value={stripeKey} onChange={(e) => setStripeKey(e.target.value)} />
                  <p className="text-xs text-muted-foreground">{t("payments.keyHelp")}</p>
                  {stripeError && <p className="text-xs text-red-500">{stripeError}</p>}
                  <button className={cn(BTN, "bg-accent text-accent-foreground")} disabled={stripeBusy || !stripeKey.trim()} onClick={() => void saveStripeKey()}>
                    {stripeBusy ? t("payments.saving") : t("payments.save")}
                  </button>
                </>
              )}
            </div>
            <div className="self-start">
              <button className={cn(BTN, "border border-border text-muted-foreground hover:text-foreground")} onClick={() => void disconnect()}>
                <Unplug className="size-4" />{t("disconnect")}
              </button>
            </div>
          </div>

          {stats && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">{t("report.title")}</h2>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                {([
                  ["newConversations", stats.newConversations],
                  ["inbound", stats.inboundMessages],
                  ["aiReplies", stats.aiReplies],
                  ["staffReplies", stats.staffReplies],
                  ["auto", stats.remindersAndConfirmations],
                  ["bookings", stats.bookingsFromWhatsAppContacts],
                  ["needingAttention", stats.needingAttention],
                  ["optedOut", stats.optedOut],
                ] as const).map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-muted/50 px-3 py-2">
                    <div className="text-xl font-semibold tabular-nums">{value}</div>
                    <div className="text-xs text-muted-foreground">{t(`report.${key}`)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    {status?.paymentsConnected && (
                      <button className={cn(BTN, "border border-border")} onClick={() => setPayOpen((v) => !v)}><CreditCard className="size-4" />{t("payments.send")}</button>
                    )}
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
                  {payOpen && status?.paymentsConnected && (
                    <div className="border-t border-border p-3 space-y-2 bg-muted/30">
                      <div className="grid gap-2 sm:grid-cols-[8rem_6rem_1fr]">
                        <input className={INPUT} inputMode="decimal" placeholder={t("payments.amount")} aria-label={t("payments.amount")} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                        <select className={INPUT} aria-label={t("payments.currency")} value={pay.currency} onChange={(e) => setPay({ ...pay, currency: e.target.value })}>
                          {["aed", "sar", "qar", "usd", "eur", "gbp"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                        </select>
                        <input className={INPUT} maxLength={120} placeholder={t("payments.descriptionPlaceholder")} aria-label={t("payments.description")} value={pay.description} onChange={(e) => setPay({ ...pay, description: e.target.value })} />
                      </div>
                      {payError && <p className="text-xs text-red-500">{payError}</p>}
                      <button className={cn(BTN, "bg-accent text-accent-foreground")} disabled={payBusy || !(Number(pay.amount) > 0) || !pay.description.trim() || !thread.conversation.windowOpen} onClick={() => void sendPaymentLink()}>
                        {payBusy ? t("payments.sending") : t("payments.sendLink")}
                      </button>
                    </div>
                  )}
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
