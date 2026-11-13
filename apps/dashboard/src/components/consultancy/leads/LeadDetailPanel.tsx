"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LEAD_STATUSES, SOURCE_LABEL, STATUS_LABEL, formatDate, leadTitle, type Lead, type LeadDetail, type LeadStatus } from "./lead-types";

/** Turns an answer key such as "painHours" into "Pain hours". */
const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const show = (v: unknown) => (typeof v === "string" ? v : typeof v === "boolean" ? (v ? "Yes" : "No") : JSON.stringify(v));

/** Everything about one prospect: what they told us, the audit so far, and the fields the team can change. */
export function LeadDetailPanel({ id, onChanged, onClose }: { id: string; onChanged: (lead: Lead) => void; onClose: () => void }) {
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    let live = true;
    setDetail(null);
    setError("");
    setSaved("");
    api
      .get<LeadDetail>(`/consultancy-admin/leads/${id}`, { fresh: true })
      .then((d) => {
        if (!live) return;
        setDetail(d);
        setNotes(d.lead.notes ?? "");
        setOwner(d.lead.owner_email ?? "");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load this prospect."));
    return () => {
      live = false;
    };
  }, [id]);

  async function save(patch: Record<string, string>, message: string) {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const lead = await api.patch<Lead>(`/consultancy-admin/leads/${id}`, patch);
      setDetail((d) => (d ? { ...d, lead: { ...d.lead, ...lead, answers: d.lead.answers } } : d));
      setSaved(message);
      onChanged(lead);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !detail) return <aside className="rounded-xl border border-border p-4 text-sm text-red-600" role="alert">{error}</aside>;
  if (!detail) return <aside className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Loading…</aside>;
  const { lead, audit } = detail;
  const answers = Object.entries(lead.answers ?? {}).filter(([, v]) => v !== "" && v !== null && v !== undefined);

  return (
    <aside className="rounded-xl border border-border p-4 space-y-4" aria-label="Prospect details">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold break-words">{leadTitle(lead)}</h2>
          <p className="text-xs text-muted-foreground">
            {SOURCE_LABEL[lead.source] ?? lead.source} · received {formatDate(lead.created_at)}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {[["Contact", lead.contact_name], ["Email", lead.email], ["Phone", lead.phone], ["Country", lead.country]].map(([k, v]) =>
          v ? (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ) : null,
        )}
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">
          Status
          <select
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={lead.status}
            disabled={busy}
            onChange={(e) => void save({ status: e.target.value as LeadStatus }, "Status updated.")}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <div className="text-xs font-medium text-muted-foreground">
          <label htmlFor={`owner-${id}`}>Owner (email)</label>
          <div className="mt-1 flex gap-2">
            <input
              id={`owner-${id}`}
              className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="name@company.com"
            />
            <Button size="sm" variant="outline" disabled={busy || owner === (lead.owner_email ?? "")} onClick={() => void save({ owner_email: owner }, "Owner saved.")}>Save</Button>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor={`notes-${id}`} className="text-xs font-medium text-muted-foreground">Notes</label>
        <textarea
          id={`notes-${id}`}
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          rows={4}
          value={notes}
          maxLength={5000}
          onChange={(e) => setNotes(e.target.value)}
        />
        <Button className="mt-2" size="sm" disabled={busy || notes === (lead.notes ?? "")} onClick={() => void save({ notes }, "Notes saved.")}>Save notes</Button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">{saved}</p>}

      {audit && (
        <section className="rounded-lg bg-muted/40 p-3 text-sm" aria-label="Audit">
          <h3 className="font-semibold">Audit ({audit.id})</h3>
          <p>Status: {audit.status.replace(/_/g, " ")}{audit.fee_aed ? ` · suggested fee AED ${audit.fee_aed.toLocaleString("en-US")}` : ""}</p>
          {audit.summary && <p className="mt-1 text-muted-foreground">{audit.summary}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {[audit.approved_at && `approved ${formatDate(audit.approved_at)}`, audit.paid_at && `paid ${formatDate(audit.paid_at)}`, audit.delivered_at && `delivered ${formatDate(audit.delivered_at)}`].filter(Boolean).join(" · ")}
          </p>
        </section>
      )}

      <section aria-label="Their answers">
        <h3 className="text-sm font-semibold">What they told us</h3>
        {answers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No answers saved.</p>
        ) : (
          <dl className="mt-2 space-y-2 text-sm">
            {answers.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{label(k)}</dt>
                <dd className="whitespace-pre-wrap break-words">{show(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </aside>
  );
}
