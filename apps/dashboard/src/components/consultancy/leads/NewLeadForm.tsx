"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { Lead } from "./lead-types";

const FIELDS = [
  { key: "company", label: "Company" },
  { key: "contact_name", label: "Contact name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "country", label: "Country" },
] as const;

/** Adds a prospect by hand (someone met at an event, a referral). */
export function NewLeadForm({ onCreated, onCancel }: { onCreated: (lead: Lead) => void; onCancel: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({ company: "", contact_name: "", email: "", phone: "", country: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!values.company.trim() && !values.contact_name.trim() && !values.email.trim()) {
      setError("Add at least a company, a contact name or an email.");
      return;
    }
    setSaving(true);
    try {
      const lead = await api.post<Lead>("/consultancy-admin/leads", values);
      onCreated(lead);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the prospect.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border p-4 space-y-3" aria-label="Add a prospect">
      <h2 className="text-sm font-semibold">Add a prospect</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-xs font-medium text-muted-foreground">
            {f.label}
            <input
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              maxLength={f.key === "phone" ? 40 : 200}
            />
          </label>
        ))}
      </div>
      <label className="block text-xs font-medium text-muted-foreground">
        Notes
        <textarea
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          rows={2}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          maxLength={5000}
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Adding…" : "Add prospect"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
