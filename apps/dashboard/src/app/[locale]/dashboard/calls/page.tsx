"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Phone, Search, ArrowUpRight, Clock, ChevronLeft, ChevronRight, ShieldBan } from "lucide-react";
import { IconBox, outcomeIconVariant } from "@/components/ui-kit/IconBox";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { api } from "@/lib/api";
import { readApiGetCache } from "@/lib/api-get-cache";
import { DASHBOARD_POLL_MS } from "@/lib/dashboard-sync";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { timeAgo, formatDuration, formatPhone } from "@/lib/utils";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardTabs } from "@/components/ui-kit/DashboardTabs";

interface Call {
  id: string;
  call_sid: string;
  transcript?: string | null;
  transcript_snippet?: string | null;
  duration_ms: number;
  outcome: string | null;
  created_at: string;
}

interface SpamLogEntry {
  id: string;
  callSid: string;
  phoneNumber: string;
  reason: string;
  createdAt: string;
}

const CALL_TABS = [
  { id: "All", label: "All" },
  { id: "Completed", label: "Completed" },
  { id: "Failed", label: "Failed" },
  { id: "Transferred", label: "Transferred" },
  { id: "Spam", label: "Spam blocked" },
] as const;

const PAGE_SIZE = 50;

function initialCallsPage(): { calls: Call[]; total: number; hasMore: boolean } {
  const cached = readApiGetCache<{
    items?: Call[];
    total?: number;
    hasMore?: boolean;
  }>("/calls?limit=50&offset=0");
  if (!cached?.items?.length) return { calls: [], total: 0, hasMore: false };
  return {
    calls: cached.items.map((call) => ({
      ...call,
      transcript: call.transcript ?? call.transcript_snippet ?? null,
    })),
    total: cached.total ?? cached.items.length,
    hasMore: cached.hasMore ?? false,
  };
}

export default function CallsPage() {
  const [initialData] = useState(() => initialCallsPage());
  const [calls, setCalls] = useState<Call[]>(() => initialData.calls);
  const [loading, setLoading] = useState(() => initialData.calls.length === 0);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("All");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(() => initialData.total);
  const [hasMore, setHasMore] = useState(() => initialData.hasMore);
  const [spamLog, setSpamLog] = useState<SpamLogEntry[]>([]);
  const [spamLoading, setSpamLoading] = useState(false);

  const isSpamTab = activeTab === "Spam";

  const outcomeParam =
    activeTab === "Completed"
      ? "completed"
      : activeTab === "Failed"
        ? "failed"
        : activeTab === "Transferred"
          ? "transferred"
          : "";

  const loadSpamLog = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setSpamLoading(true);
    api
      .get<SpamLogEntry[]>("/spam/log?limit=50")
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setSpamLog(
          list.map((r) => {
            const row = r as unknown as Record<string, unknown>;
            return {
              id: String(row.id ?? ""),
              callSid: String(row.callSid ?? row.call_sid ?? ""),
              phoneNumber: String(row.phoneNumber ?? row.phone_number ?? ""),
              reason: String(row.reason ?? ""),
              createdAt: String(row.createdAt ?? row.created_at ?? ""),
            };
          })
        );
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setSpamLoading(false));
  }, []);

  const loadCalls = useCallback((opts?: { silent?: boolean }) => {
    if (isSpamTab) {
      loadSpamLog(opts);
      return;
    }
    if (!opts?.silent) setLoading(true);
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(offset),
    };
    if (search.trim()) params.search = search.trim();
    if (outcomeParam) params.outcome = outcomeParam;

    api
      .getList<Call>("/calls", params)
      .then(({ items, total: t, hasMore: more }) => {
        setCalls(
          items.map((call) => ({
            ...call,
            transcript: call.transcript ?? call.transcript_snippet ?? null,
          }))
        );
        setTotal(t);
        setHasMore(more);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, outcomeParam, offset, isSpamTab, loadSpamLog]);

  useRealtimeQuery(["calls"], loadCalls, `${search}|${activeTab}|${offset}`, {
    pollMs: DASHBOARD_POLL_MS,
    pollOnlyWhenDisconnected: true,
  });

  useEffect(() => {
    setOffset(0);
  }, [search, activeTab]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + calls.length, total);

  const getOutcomeBadge = (outcome: string | null) => {
    switch (outcome) {
      case "completed":
        return <span className="badge-success" role="status">Completed</span>;
      case "failed":
        return <span className="badge-error" role="status">Failed</span>;
      case "transferred":
        return <span className="badge-warning" role="status">Transferred</span>;
      default:
        return <span className="badge-neutral" role="status">Unknown</span>;
    }
  };

  return (
    <DashboardPage
      title="Calls"
      description={
        isSpamTab
          ? "Calls blocked by spam protection — configure rules in Settings."
          : "Recordings, transcripts, and outcomes for every conversation"
      }
      loading={(isSpamTab ? spamLoading : loading) && (isSpamTab ? spamLog.length === 0 : calls.length === 0)}
      error={error || undefined}
      toolbar={
        <>
          {!isSpamTab && (
            <div className="relative flex-1 min-w-0 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by call ID or transcript…"
                aria-label="Search calls by call ID or transcript"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          )}
          <DashboardTabs
            tabs={CALL_TABS.map((t) => ({ id: t.id, label: t.label }))}
            activeId={activeTab}
            onChange={setActiveTab}
            className="sm:self-start"
          />
        </>
      }
    >
      <div className="dashboard-panel">
        {isSpamTab ? (
          spamLog.length === 0 && !spamLoading ? (
            <EmptyState
              icon={ShieldBan}
              title="No blocked spam calls"
              description="When spam protection rejects a caller, entries appear here."
              iconVariant="muted"
              action={
                <Link href="/dashboard/settings/spam" className="btn-ghost text-sm">
                  Spam settings
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {spamLog.map((entry) => (
                <div key={entry.id} className="dashboard-list-row">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <IconBox icon={ShieldBan} variant="warning" size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {formatPhone(entry.phoneNumber) || entry.phoneNumber}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{entry.reason}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="badge-warning">Blocked</span>
                    {entry.callSid && (
                      <span className="text-xs text-muted-foreground font-mono">{entry.callSid.slice(0, 12)}…</span>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {entry.createdAt ? timeAgo(entry.createdAt) : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : calls.length === 0 && !loading ? (
          <EmptyState
            icon={Phone}
            title={search || activeTab !== "All" ? "No calls match your filters" : "No calls yet"}
            description={
              search || activeTab !== "All"
                ? "Try adjusting your search or filter criteria."
                : "Calls will appear here once your AI agent starts handling conversations."
            }
            iconVariant="muted"
          />
        ) : (
          <>
            <div className="divide-y divide-border">
              {calls.map((call) => (
                <Link
                  key={call.id}
                  href={`/dashboard/calls/${call.id}`}
                  className="dashboard-list-row group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 w-full">
                    <IconBox icon={Phone} variant={outcomeIconVariant(call.outcome)} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{call.call_sid}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {call.transcript?.substring(0, 60) || "No transcript available"}
                        {(call.transcript?.length ?? 0) > 60 ? "..." : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 shrink-0 sm:ml-4 w-full sm:w-auto sm:justify-end">
                    {getOutcomeBadge(call.outcome)}
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="text-xs whitespace-nowrap">{formatDuration(call.duration_ms)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground sm:w-16 sm:text-right whitespace-nowrap">
                      {timeAgo(call.created_at)}
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors sm:ml-1 ml-auto" />
                  </div>
                </Link>
              ))}
            </div>

            {total > PAGE_SIZE && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Showing {rangeStart}–{rangeEnd} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    disabled={offset === 0}
                    onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <span className="text-xs text-muted-foreground px-2">
                    Page {page} of {pageCount}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    disabled={!hasMore}
                    onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardPage>
  );
}
