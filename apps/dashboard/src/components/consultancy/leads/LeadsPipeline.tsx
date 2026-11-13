"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LeadDetailPanel } from "./LeadDetailPanel";
import { NewLeadForm } from "./NewLeadForm";
import { LEAD_STATUSES, SOURCE_LABEL, STATUS_LABEL, formatDate, leadTitle, type Lead, type LeadList, type LeadStatus } from "./lead-types";

const PAGE = 50;

/** The team's pipeline: counts per status, a searchable table and a panel for the selected prospect. */
export function LeadsPipeline() {
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<LeadList | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);

  // Wait a moment after typing before searching.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    try {
      const d = await api.get<LeadList>(`/consultancy-admin/leads?${params}`, { fresh: true });
      if (mine !== seq.current) return;
      setData(d);
      setError("");
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : "Could not load the prospects.");
    }
  }, [status, q, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = data ? LEAD_STATUSES.reduce((n, s) => n + (data.counts[s] ?? 0), 0) : 0;
  const chip = (value: LeadStatus | "", text: string, count: number | undefined) => (
    <button
      key={value || "all"}
      type="button"
      aria-pressed={status === value}
      onClick={() => {
        setStatus(value);
        setOffset(0);
      }}
      className={`rounded-full border px-3 py-1 text-sm ${status === value ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
    >
      {text} <span className="opacity-70">{count ?? 0}</span>
    </button>
  );

  const items = data?.items ?? [];
  const list = (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search prospects"
          placeholder="Search company, name, email or phone"
          className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button size="sm" onClick={() => setAdding((v) => !v)}>{adding ? "Hide form" : "Add a prospect"}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && items.length === 0 && <p className="text-sm text-muted-foreground">No prospects match.</p>}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr
                  key={l.id}
                  className={`cursor-pointer border-t border-border hover:bg-muted/40 ${selected === l.id ? "bg-muted/60" : ""}`}
                  onClick={() => setSelected(l.id)}
                >
                  <td className="px-3 py-2 font-medium">
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setSelected(l.id)}>{leadTitle(l)}</button>
                  </td>
                  <td className="px-3 py-2">{l.contact_name || l.email || ""}</td>
                  <td className="px-3 py-2">{SOURCE_LABEL[l.source] ?? l.source}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[l.status] ?? l.status}</td>
                  <td className="px-3 py-2">{l.owner_email || ""}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > PAGE && (
        <div className="flex items-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
          <span className="text-muted-foreground">{offset + 1} to {Math.min(offset + PAGE, data.total)} of {data.total}</span>
          <Button size="sm" variant="outline" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {chip("", "All", total)}
        {LEAD_STATUSES.map((s) => chip(s, STATUS_LABEL[s], data?.counts[s]))}
      </div>
      {adding && (
        <NewLeadForm
          onCancel={() => setAdding(false)}
          onCreated={(lead: Lead) => {
            setAdding(false);
            setSelected(lead.id);
            void load();
          }}
        />
      )}
      <div className={selected ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]" : ""}>
        {list}
        {selected && (
          <LeadDetailPanel
            id={selected}
            onClose={() => setSelected(null)}
            onChanged={() => void load()}
          />
        )}
      </div>
    </div>
  );
}
