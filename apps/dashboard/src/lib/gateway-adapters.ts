/** Normalize gateway API shapes for dashboard UI */

import { DEFAULT_TIMEZONE } from "@/lib/timezones";

export function capabilityList(caps: unknown): string[] {
  if (Array.isArray(caps)) return caps.map(String);
  if (caps && typeof caps === "object") {
    return Object.entries(caps as Record<string, unknown>)
      .filter(([, v]) => v === true || v === "true")
      .map(([k]) => k);
  }
  return ["voice"];
}

export function normalizePhoneNumber(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    phoneNumber: String(row.phoneNumber ?? row.phone_number ?? row.phone ?? ""),
    status: String(row.status ?? "active"),
    monthlyCost: Number(row.monthlyCost ?? row.cost ?? row.monthly_cost ?? 0),
    purchasedAt: String(row.purchasedAt ?? row.created_at ?? row.purchased_at ?? ""),
    capabilities: capabilityList(row.capabilities),
    aiAgentId: row.aiAgentId != null ? String(row.aiAgentId) : row.ai_agent_id != null ? String(row.ai_agent_id) : null,
  };
}

export function normalizeBillingUsage(raw: unknown) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const usage = (r.usage && typeof r.usage === "object" ? r.usage : r) as Record<string, unknown>;
  const limits = (r.limits && typeof r.limits === "object" ? r.limits : {}) as Record<string, unknown>;
  const includedMinutes = Number(
    limits.includedMinutes ?? limits.callMinutes ?? 250
  );
  const minutesObj = usage.minutes as Record<string, unknown> | undefined;
  const smsObj = usage.sms as Record<string, unknown> | undefined;
  const storageObj = usage.storage as Record<string, unknown> | undefined;
  const callMinutes = Number(usage.callMinutes ?? minutesObj?.used ?? 0);
  const smsMessages = Number(usage.smsMessages ?? smsObj?.used ?? 0);
  const storageGb = Number(usage.storageGb ?? storageObj?.used ?? 0);
  return {
    minutes: { used: callMinutes, limit: includedMinutes },
    sms: {
      used: smsMessages,
      limit: Number(limits.smsMessages ?? 500),
    },
    storage: {
      used: storageGb,
      limit: Number(limits.storageGb ?? 5),
    },
  };
}

export function normalizeSubscription(raw: unknown) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let plan = String(r.plan ?? "essential").toLowerCase();
  if (plan === "starter") plan = "essential";
  const prices: Record<string, number> = {
    starter: 39,
    essential: 39,
    professional: 149,
  };
  const status = String(r.status ?? "active").toLowerCase();
  return {
    plan,
    status: status === "cancelled" ? "canceled" : status,
    current_period_end: String(
      r.current_period_end ?? r.currentPeriodEnd ?? ""
    ),
    price: Number(r.price ?? prices[plan] ?? 39),
    cancelAtPeriodEnd: Boolean(r.cancelAtPeriodEnd ?? r.cancel_at_period_end),
    stripeSubscriptionId:
      (r.stripeSubscriptionId ?? r.stripe_subscription_id ?? null) as string | null,
  };
}

export function subscriptionNeedsCheckout(
  sub: {
    status?: string;
    cancelAtPeriodEnd?: boolean;
    stripeSubscriptionId?: string | null;
  } | null
): boolean {
  if (!sub) return true;
  const status = String(sub.status ?? "").toLowerCase();
  if (["trialing", "canceled", "cancelled", "incomplete", "unpaid"].includes(status)) {
    return true;
  }
  if (sub.cancelAtPeriodEnd) return true;
  if (!sub.stripeSubscriptionId) return true;
  return false;
}

export function normalizeInvoice(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    date: String(row.date ?? row.createdAt ?? row.created_at ?? ""),
    amount: Number(row.amount ?? 0),
    status: String(row.status ?? "paid"),
    pdf_url: String(row.pdf_url ?? row.invoiceUrl ?? row.invoice_url ?? ""),
  };
}

export function normalizeLead(row: Record<string, unknown>) {
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  let status = String(row.status ?? "new");
  if (
    status === "qualified" &&
    (meta.appointmentBooked === true || meta.appointmentBooked === "true")
  ) {
    status = "appointment_set";
  }
  return {
    id: String(row.id),
    name: String(row.name ?? "Unknown"),
    phoneNumber: String(row.phoneNumber ?? row.phone_number ?? row.phone ?? ""),
    email: String(row.email ?? meta.email ?? ""),
    status,
    score: Number(row.score ?? 0),
    source: String(row.source ?? row.service ?? "inbound_call"),
    created_at: String(row.created_at ?? row.createdAt ?? ""),
  };
}

export function normalizeCalendarEvent(row: Record<string, unknown>) {
  const start = row.start ?? row.start_time ?? row.scheduled_time;
  const end =
    row.end ??
    row.end_time ??
    (start
      ? new Date(new Date(String(start)).getTime() + 3600000).toISOString()
      : "");
  return {
    id: String(row.id),
    title: String(row.title ?? row.service ?? row.name ?? "Appointment"),
    start: String(start ?? ""),
    end: String(end),
    type: String(row.type ?? "appointment"),
    attendee: String(row.attendee ?? row.attendee_phone ?? row.phone ?? ""),
    attendeeName: String(row.name ?? row.title ?? ""),
    attendeePhone: String(row.phone ?? row.attendee_phone ?? row.attendee ?? ""),
    service: String(row.service ?? row.title ?? "Appointment"),
    location: String(row.location ?? ""),
    color: String(row.color ?? "#C9A24B"),
    status: String(row.status ?? "booked"),
  };
}

export function normalizeTeamMember(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    userId: String(row.userId ?? row.user_id ?? ""),
    email: String(row.email ?? ""),
    name: String(row.name ?? row.full_name ?? ""),
    role: String(row.role ?? "agent"),
    status: String(row.status ?? (row.is_active === false ? "inactive" : "active")),
    joined_at: String(row.joined_at ?? row.createdAt ?? row.created_at ?? ""),
  };
}

export function normalizeAnalyticsMetrics(raw: Record<string, unknown>) {
  const totalCalls = Number(raw.totalCalls ?? 0);
  const totalLeads = Number(raw.totalLeads ?? raw.leads ?? 0);
  // avgCallDuration is in seconds. avgResponseLatency is AI response latency in ms.
  // The old field name was avgLatency (incorrectly mapped to duration) — support both during migration.
  const avgSec = Number(raw.avgCallDuration ?? raw.avgDuration ?? raw.avgResponseLatency ?? raw.avgLatency ?? 0);
  return {
    totalCalls,
    totalLeads,
    conversionRate: Number(
      raw.conversionRate ??
        (totalCalls > 0 ? Math.round((totalLeads / totalCalls) * 1000) / 10 : 0)
    ),
    avgDuration: avgSec > 120 ? Math.round(avgSec / 1000) : Math.round(avgSec),
    callsChange: Number(raw.callsChange ?? raw.calls_change ?? 0),
    leadsChange: Number(raw.leadsChange ?? raw.leads_change ?? 0),
  };
}

export function funnelFromMetrics(metrics: {
  totalCalls?: number;
  totalLeads?: number;
  conversionRate?: number;
}) {
  const calls = metrics.totalCalls ?? 0;
  const leads = metrics.totalLeads ?? 0;
  const converted = Math.round((calls * (metrics.conversionRate ?? 0)) / 100);
  return [
    { name: "Calls", value: calls, fill: "#C9A24B" },
    { name: "Leads", value: leads, fill: "#E4C878" },
    { name: "Converted", value: converted, fill: "#10B981" },
  ];
}

export function funnelFromApi(raw: unknown) {
  if (Array.isArray(raw)) return raw;
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, number>;
  const steps = [
    { key: "calls", name: "Calls", fill: "#C9A24B" },
    { key: "leads", name: "Leads", fill: "#E4C878" },
    { key: "qualified", name: "Qualified", fill: "#818CF8" },
    { key: "appointments", name: "Appointments", fill: "#A78BFA" },
    { key: "confirmed", name: "Confirmed", fill: "#10B981" },
  ];
  const max = Math.max(...steps.map((s) => Number(o[s.key] ?? 0)), 1);
  return steps.map((s) => ({
    name: s.name,
    value: Number(o[s.key] ?? 0),
    fill: s.fill,
    percentage: Math.round((Number(o[s.key] ?? 0) / max) * 100),
  }));
}

export function normalizeSmsMessage(row: Record<string, unknown>, peerPhone: string) {
  const direction = String(row.direction ?? "inbound");
  const phone = String(row.phoneNumber ?? row.phone_number ?? peerPhone);
  return {
    id: String(row.id ?? `${phone}-${row.createdAt ?? row.created_at ?? Date.now()}`),
    from: direction === "outbound" ? "business" : phone,
    to: direction === "outbound" ? phone : "business",
    body: String(row.body ?? row.message ?? ""),
    direction: direction as "inbound" | "outbound",
    created_at: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
  };
}

export function normalizeSmsConversation(row: Record<string, unknown>) {
  const phone = String(row.phone ?? row.phoneNumber ?? row.phone_number ?? "");
  const msgs = Array.isArray(row.messages) ? row.messages : [];
  const last = msgs[0] as Record<string, unknown> | undefined;
  return {
    phone,
    name: String(row.name ?? row.customerName ?? row.customer_name ?? ""),
    lastMessage: String(
      row.lastMessage ??
        row.last_message ??
        last?.message ??
        last?.body ??
        ""
    ),
    lastMessageAt: String(
      row.lastMessageAt ?? row.last_message_at ?? ""
    ),
    unread: Number(row.unread ?? row.unreadCount ?? row.unread_count ?? 0),
  };
}

export function smsConversationMessages(
  data: unknown,
  peerPhone: string
): ReturnType<typeof normalizeSmsMessage>[] {
  let list: ReturnType<typeof normalizeSmsMessage>[] = [];
  if (Array.isArray(data)) {
    list = data.map((m) =>
      normalizeSmsMessage(m as Record<string, unknown>, peerPhone)
    );
  } else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const msgs = Array.isArray(o.messages) ? o.messages : [];
    list = msgs.map((m) =>
      normalizeSmsMessage(m as Record<string, unknown>, peerPhone)
    );
  }
  return list.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export interface DashboardAIConfigShape {
  agentName: string;
  greetingMessage: string;
  transferPhoneNumber: string;
  voice: string;
  language: string;
  /** From GET /ai-config — languages allowed on current billing plan */
  allowedLanguages?: string[];
  tone: string;
  customInstructions: string;
  doRules: string[];
  dontRules: string[];
  capabilities: {
    bookAppointments: boolean;
    transferCalls: boolean;
    collectPayments: boolean;
    sendSMS: boolean;
    accessKnowledge: boolean;
  };
}

const DEFAULT_AI_CAPABILITIES: DashboardAIConfigShape["capabilities"] = {
  bookAppointments: true,
  transferCalls: true,
  collectPayments: false,
  sendSMS: true,
  accessKnowledge: true,
};

/** Body for PUT /ai-config (omit read-only plan fields from GET) */
export function toAIConfigSavePayload(
  config: DashboardAIConfigShape
): Omit<DashboardAIConfigShape, "allowedLanguages"> {
  const { allowedLanguages: _omit, ...payload } = config;
  return payload;
}

/** Normalize GET /ai-config for the agent configuration page */
export function normalizeAIConfig(raw: unknown): DashboardAIConfigShape {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const caps = (r.capabilities && typeof r.capabilities === "object"
    ? r.capabilities
    : {}) as Partial<DashboardAIConfigShape["capabilities"]>;
  const allowedLanguages = Array.isArray(r.allowedLanguages)
    ? r.allowedLanguages.map(String)
    : undefined;
  let language = String(r.language ?? "en");
  if (allowedLanguages?.length && !allowedLanguages.includes(language)) {
    language = allowedLanguages[0];
  }
  return {
    agentName: String(r.agentName ?? r.agent_name ?? "Sarah"),
    greetingMessage: String(r.greetingMessage ?? r.greeting_message ?? ""),
    transferPhoneNumber: String(
      r.transferPhoneNumber ?? r.transfer_phone_number ?? ""
    ),
    voice: (() => {
      const raw = String(r.voice ?? r.voiceId ?? r.voice_id ?? "marin").toLowerCase();
      const aliases: Record<string, string> = {
        nova: "shimmer",
        echo: "ash",
        onyx: "cedar",
      };
      return aliases[raw] || raw;
    })(),
    language,
    allowedLanguages,
    tone:
      String(r.tone ?? "professional")
        .toLowerCase()
        .split(/[,\s]/)[0] || "professional",
    customInstructions: String(
      r.customInstructions ?? r.systemInstructions ?? ""
    ),
    doRules: Array.isArray(r.doRules)
      ? r.doRules.map(String)
      : Array.isArray(r.doInstructions)
        ? (r.doInstructions as unknown[]).map(String)
        : [],
    dontRules: Array.isArray(r.dontRules)
      ? r.dontRules.map(String)
      : Array.isArray(r.dontInstructions)
        ? (r.dontInstructions as unknown[]).map(String)
        : [],
    capabilities: { ...DEFAULT_AI_CAPABILITIES, ...caps },
  };
}

export function normalizeTenantSettings(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    companyName: String(row.companyName ?? row.company_name ?? ""),
    language: String(row.language ?? row.default_language ?? "en"),
    timezone: String(row.timezone ?? DEFAULT_TIMEZONE),
    tone: String(row.tone ?? row.voice_tone ?? "professional"),
    transferNumber: String(
      row.transferNumber ?? row.transfer_phone_number ?? ""
    ),
    diagnosticFee:
      row.diagnosticFee != null || row.diagnostic_fee != null
        ? String(row.diagnosticFee ?? row.diagnostic_fee ?? "")
        : "",
  };
}

export function tenantSettingsToApi(settings: {
  companyName: string;
  language: string;
  timezone: string;
  tone: string;
  transferNumber: string;
  diagnosticFee?: string;
}) {
  const fee =
    settings.diagnosticFee != null && settings.diagnosticFee.trim() !== ""
      ? Number.parseFloat(settings.diagnosticFee)
      : undefined;
  return {
    company_name: settings.companyName,
    default_language: settings.language,
    timezone: settings.timezone,
    voice_tone: settings.tone,
    transfer_phone_number: settings.transferNumber || null,
    ...(fee != null && !Number.isNaN(fee) ? { diagnostic_fee: fee } : {}),
  };
}

export function normalizeKnowledgeItem(row: Record<string, unknown>) {
  const text = String(row.text ?? row.content ?? "");
  return {
    id: String(row.id ?? ""),
    text,
    category: String(row.category ?? "general"),
    source: String(row.source ?? "manual"),
    created_at: String(row.created_at ?? row.createdAt ?? ""),
  };
}

export function normalizeAutomationRule(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    trigger: String(row.trigger ?? ""),
    action: String(row.action ?? ""),
    template: String(row.template ?? ""),
    enabled: row.enabled !== false && row.is_active !== false,
    created_at: String(row.created_at ?? row.createdAt ?? ""),
    runs: Number(row.runs ?? 0),
  };
}
