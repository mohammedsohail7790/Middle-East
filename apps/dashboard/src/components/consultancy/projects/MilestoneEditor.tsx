"use client";

import { useState } from "react";
import type { Milestone } from "./types";

export interface MilestoneEditorProps {
  milestones: Milestone[];
  onAdd: (title: string, dueOn: string | null) => void;
  onToggle: (m: Milestone) => void;
  onMove: (m: Milestone, direction: -1 | 1) => void;
  onDelete: (m: Milestone) => void;
}

/** Add, tick, reorder and delete the milestones of one project. Presentational: the parent talks to the API. */
export function MilestoneEditor({ milestones, onAdd, onToggle, onMove, onDelete }: MilestoneEditorProps) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, due || null);
    setTitle("");
    setDue("");
  };
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Milestones</h3>
      {milestones.length === 0 ? <p className="text-sm text-muted-foreground">No milestones yet.</p> : null}
      <ul className="space-y-1">
        {milestones.map((m, i) => (
          <li key={m.id} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
            <input type="checkbox" aria-label={`Done: ${m.title}`} checked={m.done} onChange={() => onToggle(m)} />
            <span className={`flex-1 ${m.done ? "text-muted-foreground line-through" : ""}`}>
              {m.title}
              {m.dueOn ? <span className="ml-2 text-xs text-muted-foreground">due {m.dueOn}</span> : null}
            </span>
            <button type="button" aria-label={`Move up: ${m.title}`} disabled={i === 0} onClick={() => onMove(m, -1)} className="px-1 disabled:opacity-30">
              ↑
            </button>
            <button type="button" aria-label={`Move down: ${m.title}`} disabled={i === milestones.length - 1} onClick={() => onMove(m, 1)} className="px-1 disabled:opacity-30">
              ↓
            </button>
            <button type="button" aria-label={`Delete: ${m.title}`} onClick={() => onDelete(m)} className="px-1 text-red-700">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="New milestone title" className="min-w-40 flex-1 rounded border px-2 py-1 text-sm" placeholder="New milestone" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <input aria-label="New milestone due date" type="date" className="rounded border px-2 py-1 text-sm" value={due} onChange={(e) => setDue(e.target.value)} />
        <button type="button" onClick={submit} className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground">
          Add milestone
        </button>
      </div>
    </div>
  );
}
