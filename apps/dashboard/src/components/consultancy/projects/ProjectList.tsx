"use client";

import { STATUS_LABEL, type ProjectSummary, type ProjectStatus } from "./types";

const CHIP: Record<ProjectStatus, string> = {
  planned: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-800",
  delivered: "bg-emerald-100 text-emerald-800",
  on_hold: "bg-amber-100 text-amber-800",
  cancelled: "bg-zinc-200 text-zinc-600",
};

export function StatusChip({ status }: { status: ProjectStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[status]}`}>{STATUS_LABEL[status]}</span>;
}

/** The team's list of delivery projects: status chip, overdue highlight and milestone progress. */
export function ProjectList({ projects, selectedId, onSelect }: { projects: ProjectSummary[]; selectedId?: string | null; onSelect: (id: string) => void }) {
  if (!projects.length) return <p className="text-sm text-muted-foreground">No projects yet. Create one from an accepted proposal.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {projects.map((p) => {
        const total = p.milestoneTotal ?? 0;
        const done = p.milestoneDone ?? 0;
        const pct = total ? Math.round((done / total) * 100) : 0;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              data-overdue={p.overdue ? "true" : "false"}
              className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/50 ${p.overdue ? "border-l-4 border-red-500 bg-red-50" : ""} ${selectedId === p.id ? "ring-1 ring-inset ring-primary" : ""}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{p.name}</span>
                <StatusChip status={p.status} />
              </span>
              <span className="text-xs text-muted-foreground">
                {p.company ?? "No company"} · Delivery {p.deliveryDate ?? "not set"}
                {p.overdue ? <strong className="ml-2 text-red-700">Overdue</strong> : null}
              </span>
              <span className="flex items-center gap-2 text-xs">
                <span className="h-1.5 w-24 overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                </span>
                {total ? `${done} of ${total} milestones done` : "No milestones"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
