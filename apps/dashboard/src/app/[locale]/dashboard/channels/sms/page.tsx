"use client";

import { useCallback, useState } from "react";
import { MessageSquare, Phone } from "lucide-react";
import { api, asArray } from "@/lib/api";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { StatCard } from "@/components/ui-kit/StatCard";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { cn, timeAgo } from "@/lib/utils";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { DASHBOARD_POLL_MS } from "@/lib/dashboard-sync";

interface SmsConversation {
  phoneNumber: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  messageCount: number;
}

export default function SmsChannelPage() {
  const [conversations, setConversations] = useState<SmsConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadConversations = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    api
      .get<SmsConversation[]>("/sms/conversations")
      .then((data) => { setConversations(asArray<SmsConversation>(data)); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useRealtimeQuery(["sms"], loadConversations, "", {
    pollMs: DASHBOARD_POLL_MS,
    pollOnlyWhenDisconnected: true,
  });

  const unreadTotal = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <DashboardPage
      title="SMS"
      description="Text message conversations with your customers."
      loading={loading && conversations.length === 0}
      error={error || undefined}
    >
      <div className="dashboard-stat-grid dashboard-stat-grid--three">
        <StatCard label="Conversations" value={conversations.length} icon={MessageSquare} iconVariant="accent" index={0} />
        <StatCard label="Unread" value={unreadTotal} icon={MessageSquare} iconVariant="warning" index={1} />
        <StatCard label="Total messages" value={conversations.reduce((sum, c) => sum + c.messageCount, 0)} icon={Phone} iconVariant="muted" index={2} />
      </div>

      <DashboardPageSection title="Conversations" icon={MessageSquare} iconVariant="accent">
        {conversations.length === 0 && !loading ? (
          <EmptyState
            icon={MessageSquare}
            title="No SMS conversations yet"
            description="Text messages from your customers will appear here."
          />
        ) : (
          <div className="divide-y divide-border">
            {conversations.map((conv) => (
              <div key={conv.phoneNumber} className="py-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">{conv.phoneNumber}</span>
                    {conv.unreadCount > 0 && (
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-accent/10 text-accent-dark font-semibold">
                        {conv.unreadCount} new
                      </span>
                    )}
                  </div>
                  <p className={cn("text-sm line-clamp-1", conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                    {conv.lastMessage}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{timeAgo(conv.lastMessageAt)}</span>
              </div>
            ))}
          </div>
        )}
      </DashboardPageSection>
    </DashboardPage>
  );
}
