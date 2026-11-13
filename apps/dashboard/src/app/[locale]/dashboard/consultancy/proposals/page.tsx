"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ProposalEditor, type NewProposal } from "@/components/consultancy/proposals/ProposalEditor";
import { ProposalList } from "@/components/consultancy/proposals/ProposalList";
import type { LeadOption, Proposal } from "@/components/consultancy/proposals/proposal-utils";

const FILTERS = ["all", "draft", "sent", "accepted", "declined", "expired", "withdrawn"] as const;

/** Reads whatever shape the leads list returns: an array, or an object holding one. Anything unreadable gives no options (the editor then asks for a lead id). */
function toLeadOptions(raw: unknown): LeadOption[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { leads?: unknown })?.leads) ? (raw as { leads: unknown[] }).leads : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
  return list
    .map((l) => l as { id?: string; company?: string | null; contact_name?: string | null; email?: string | null })
    .filter((l) => typeof l.id === "string")
    .map((l) => ({ id: l.id as string, label: [l.company, l.contact_name, l.email].filter(Boolean).join(", ") || (l.id as string) }));
}

export default function Page() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError("");
      const rows = await api.get<Proposal[]>(`/consultancy-admin/proposals${filter === "all" ? "" : `?status=${filter}`}`, { fresh: true });
      setProposals(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load proposals.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.get<unknown>("/consultancy-admin/leads").then((r) => setLeads(toLeadOptions(r))).catch(() => setLeads([]));
  }, []);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      setMessage(await fn());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const create = (p: NewProposal) =>
    run(async () => {
      await api.post("/consultancy-admin/proposals", p);
      setCreating(false);
      return "Draft saved.";
    });

  const send = (p: Proposal) =>
    run(async () => {
      const r = await api.post<{ link: string; emailed: boolean }>(`/consultancy-admin/proposals/${p.id}/send`, {});
      return r.emailed ? "Sent. The client has been emailed the link." : "Marked as sent, but email is not configured. Use Copy client link.";
    });

  const withdraw = (p: Proposal) =>
    run(async () => {
      await api.post(`/consultancy-admin/proposals/${p.id}/withdraw`, {});
      return "Withdrawn.";
    });

  const copy = async (p: Proposal) => {
    try {
      const r = await api.get<{ link: string }>(`/consultancy-admin/proposals/${p.id}/link`, { fresh: true });
      await navigator.clipboard.writeText(r.link);
      setMessage("Client link copied.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy the link.");
    }
  };

  const names = Object.fromEntries(leads.map((l) => [l.id, l.label]));

  return (
    <DashboardPage
      title="Proposals"
      description="Build prices clients accept in writing"
      loading={loading}
      actions={!creating ? <Button onClick={() => setCreating(true)}>New proposal</Button> : undefined}
    >
      <div className="space-y-4">
        {message && <p role="status" className="text-sm text-green-700">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {creating && <ProposalEditor leads={leads} busy={busy} onSubmit={create} onCancel={() => setCreating(false)} />}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
              {f}
            </Button>
          ))}
        </div>
        <ProposalList proposals={proposals} leadNames={names} onSend={send} onWithdraw={withdraw} onCopyLink={copy} />
      </div>
    </DashboardPage>
  );
}
