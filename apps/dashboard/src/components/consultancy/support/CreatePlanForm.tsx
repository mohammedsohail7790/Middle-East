"use client";

import { useState } from "react";
import { toMinor, type SupportKind } from "./types";

export interface CreatePlanInput {
  leadId: string;
  kind: SupportKind;
  priceMinor?: number;
  hoursIncluded?: number;
}

export interface LeadOption {
  id: string;
  company?: string | null;
  email?: string | null;
}

const HINT: Record<SupportKind, string> = {
  standard: "AED 750 per month, up to 4 hours.",
  extended: "AED 1,000 per month, up to 6 hours.",
  partner: "Monthly, cancel anytime, from AED 5,000. You set the price and the monthly hours.",
  training: "One-time workshop, from AED 5,000. No monthly hours.",
};

export function CreatePlanForm({ leads, onSubmit }: { leads: LeadOption[]; onSubmit: (input: CreatePlanInput) => Promise<void> }) {
  const [leadId, setLeadId] = useState("");
  const [kind, setKind] = useState<SupportKind>("standard");
  const [price, setPrice] = useState("");
  const [hours, setHours] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const custom = kind === "partner" || kind === "training";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId.trim()) return setError("Choose the lead this plan is for.");
    const input: CreatePlanInput = { leadId: leadId.trim(), kind };
    if (custom) {
      const minor = toMinor(price);
      if (minor === null || minor < 500000) return setError("Enter a price of at least 5,000 (for example 5000).");
      input.priceMinor = minor;
      if (kind === "partner") {
        const h = Number(hours);
        if (!hours.trim() || !Number.isFinite(h) || h <= 0) return setError("Enter the monthly hours included.");
        input.hoursIncluded = h;
      }
    }
    setError("");
    setSaving(true);
    try {
      await onSubmit(input);
      setPrice("");
      setHours("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the plan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4" aria-label="Create plan">
      <h3 className="font-medium">Create a support plan</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm sm:col-span-2">
          Lead
          {leads.length > 0 ? (
            <select className="mt-1 w-full rounded border px-2 py-1" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">Choose a lead</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.company || l.email || l.id}
                </option>
              ))}
            </select>
          ) : (
            <input className="mt-1 w-full rounded border px-2 py-1" value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="Lead ID" />
          )}
        </label>
        <label className="text-sm">
          Plan
          <select className="mt-1 w-full rounded border px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as SupportKind)}>
            <option value="standard">Standard</option>
            <option value="extended">Extended</option>
            <option value="partner">Partner</option>
            <option value="training">Training workshop</option>
          </select>
        </label>
        {custom && (
          <label className="text-sm">
            Price (AED)
            <input className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5000" />
          </label>
        )}
        {kind === "partner" && (
          <label className="text-sm">
            Hours per month
            <input className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{HINT[kind]} Bug fixes are free for the first 30 days after delivery, so most plans start in month 2.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50">
        {saving ? "Creating…" : "Create plan"}
      </button>
    </form>
  );
}
