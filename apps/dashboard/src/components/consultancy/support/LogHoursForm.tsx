"use client";

import { useState } from "react";

export interface HoursInput {
  hours: number;
  workedOn?: string;
  note?: string;
}

const MAX = 24;

/** Log time worked on a plan: hours (more than 0, at most 24), the day it was worked, and an optional note. */
export function LogHoursForm({ planName, onSubmit, onClose }: { planName: string; onSubmit: (input: HoursInput) => Promise<void>; onClose: () => void }) {
  const [hours, setHours] = useState("");
  const [workedOn, setWorkedOn] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(hours);
    if (!hours.trim() || !Number.isFinite(n) || n <= 0) return setError("Enter the hours worked, more than 0.");
    if (n > MAX) return setError(`One entry can be at most ${MAX} hours. Split it over days.`);
    setError("");
    setSaving(true);
    try {
      await onSubmit({ hours: n, ...(workedOn ? { workedOn } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the hours.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4" aria-label="Log hours">
      <h3 className="font-medium">Log hours for {planName}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Hours
          <input className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="1.5" />
        </label>
        <label className="text-sm">
          Day worked (blank is today)
          <input className="mt-1 w-full rounded border px-2 py-1" type="date" value={workedOn} onChange={(e) => setWorkedOn(e.target.value)} />
        </label>
        <label className="text-sm">
          What was done
          <input className="mt-1 w-full rounded border px-2 py-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50">
          {saving ? "Saving…" : "Save hours"}
        </button>
        <button type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">
          Close
        </button>
      </div>
    </form>
  );
}
