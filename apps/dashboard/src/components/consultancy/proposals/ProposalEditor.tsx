"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CURRENCIES, formatMoney, toMinor, type LeadOption } from "./proposal-utils";

export interface NewProposal {
  leadId: string;
  title: string;
  scope: string;
  currency: string;
  deliveryWeeks: number | null;
  language: "en" | "ar";
  items: { title: string; priceMinor: number }[];
}

interface Props {
  leads: LeadOption[];
  busy?: boolean;
  onSubmit: (proposal: NewProposal) => void;
  onCancel: () => void;
}

/** Creates a draft proposal: pick the lead, add line items priced in the chosen currency, and say how long the build takes. */
export function ProposalEditor({ leads, busy, onSubmit, onCancel }: Props) {
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [weeks, setWeeks] = useState("");
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [rows, setRows] = useState([{ title: "", price: "" }]);
  const [error, setError] = useState("");

  const parsed = rows.map((r) => ({ title: r.title.trim(), price: Number(r.price) }));
  const totalMinor = parsed.reduce((s, r) => s + (Number.isFinite(r.price) && r.price > 0 ? toMinor(r.price, currency) : 0), 0);

  const setRow = (i: number, patch: Partial<{ title: string; price: string }>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = () => {
    if (!leadId.trim()) return setError("Choose a lead.");
    if (!title.trim()) return setError("Add a title.");
    if (parsed.length === 0 || parsed.some((r) => !r.title || !Number.isFinite(r.price) || r.price <= 0)) return setError("Every item needs a title and a price above zero.");
    const w = weeks.trim() === "" ? null : Number(weeks);
    if (w !== null && (!Number.isInteger(w) || w < 1)) return setError("Delivery weeks must be a whole number.");
    setError("");
    onSubmit({ leadId: leadId.trim(), title: title.trim(), scope: scope.trim(), currency, deliveryWeeks: w, language, items: parsed.map((r) => ({ title: r.title, priceMinor: toMinor(r.price, currency) })) });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <h2 className="text-base font-semibold">New proposal</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Lead</span>
          {leads.length > 0 ? (
            <select aria-label="Lead" className="h-11 w-full rounded-xl border border-input bg-background px-3" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          ) : (
            <Input aria-label="Lead" placeholder="Lead id" value={leadId} onChange={(e) => setLeadId(e.target.value)} />
          )}
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Title</span>
          <Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Currency</span>
          <select aria-label="Currency" className="h-11 w-full rounded-xl border border-input bg-background px-3" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Language of the client page and email</span>
          <select aria-label="Language" className="h-11 w-full rounded-xl border border-input bg-background px-3" value={language} onChange={(e) => setLanguage(e.target.value as "en" | "ar")}>
            <option value="en">English</option>
            <option value="ar">Arabic</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Delivery weeks</span>
          <Input aria-label="Delivery weeks" inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Scope</span>
        <textarea aria-label="Scope" rows={5} className="w-full rounded-xl border border-input bg-background p-3" value={scope} onChange={(e) => setScope(e.target.value)} />
      </label>
      <div className="space-y-2">
        <p className="text-sm font-medium">Items (a fixed price each, typically AED 8,000 to AED 60,000)</p>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label={`Item ${i + 1} title`} placeholder="Item title" value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} />
            <Input aria-label={`Item ${i + 1} price`} className="w-40" placeholder={`Price in ${currency}`} inputMode="decimal" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} />
            <Button type="button" variant="ghost" size="sm" aria-label={`Remove item ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((all) => all.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((all) => [...all, { title: "", price: "" }])}>
          Add item
        </Button>
        <p className="text-sm">
          Total: <strong data-testid="proposal-total">{formatMoney(totalMinor, currency)}</strong>
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={submit}>
          Save draft
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
