"use client";

import { useEffect, useState } from "react";
import { api, humanizeApiError } from "@/lib/api";
import { HandoverChecklist } from "./HandoverChecklist";
import { MilestoneEditor } from "./MilestoneEditor";
import { StatusChip } from "./ProjectList";
import { STATUS_LABEL, type HandoverKey, type Milestone, type ProjectDetailData, type ProjectStatus } from "./types";

const BASE = "/consultancy-admin/projects";

/** One project: editable dates, status and client notes, milestones, handover, and the client's status link. */
export function ProjectDetail({ project, onChanged }: { project: ProjectDetailData; onChanged: (p: ProjectDetailData) => void }) {
  const [startsOn, setStartsOn] = useState(project.startsOn ?? "");
  const [deliveryDate, setDeliveryDate] = useState(project.deliveryDate ?? "");
  const [notes, setNotes] = useState(project.clientNotes ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsForce, setNeedsForce] = useState<ProjectStatus | null>(null);

  useEffect(() => {
    setStartsOn(project.startsOn ?? "");
    setDeliveryDate(project.deliveryDate ?? "");
    setNotes(project.clientNotes ?? "");
    setMessage(null);
    setError(null);
    setNeedsForce(null);
  }, [project.id, project.startsOn, project.deliveryDate, project.clientNotes]);

  const guard = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(humanizeApiError(e));
      return undefined;
    }
  };
  const reload = async () => onChanged(await api.get<ProjectDetailData>(`${BASE}/${project.id}`, { fresh: true }));

  const save = (body: Record<string, unknown>) =>
    guard(async () => {
      onChanged(await api.patch<ProjectDetailData>(`${BASE}/${project.id}`, body));
      setMessage("Saved.");
    });

  const setStatus = async (status: ProjectStatus, force = false) => {
    setNeedsForce(null);
    setError(null);
    try {
      onChanged(await api.patch<ProjectDetailData>(`${BASE}/${project.id}`, { status, force }));
      setMessage("Saved.");
    } catch (e) {
      const msg = humanizeApiError(e);
      if (status === "delivered" && /handover|tick/i.test(msg)) setNeedsForce(status);
      setError(msg);
    }
  };

  const milestones = project.milestones;
  const move = (m: Milestone, dir: -1 | 1) =>
    guard(async () => {
      const ids = milestones.map((x) => x.id);
      const i = ids.indexOf(m.id);
      const j = i + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await api.post(`${BASE}/${project.id}/milestones/reorder`, { order: ids });
      await reload();
    });

  const statusLink = (send: boolean) =>
    guard(async () => {
      const r = await api.post<{ url: string; emailed?: string }>(`${BASE}/${project.id}/status-link`, { send });
      if (send) setMessage(r.emailed === "sent" ? "Status link emailed to the client." : "Email is not set up here, so nothing was sent. The link was not copied.");
      else {
        await navigator.clipboard?.writeText(r.url);
        setMessage("Status link copied. It works for 180 days.");
      }
    });

  return (
    <div className="space-y-5 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{project.name}</h2>
        <StatusChip status={project.status} />
      </div>
      {project.overdue ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">Overdue: the delivery date has passed.</p> : null}
      {project.warrantyEndsOn ? <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Free bug fixes until {project.warrantyEndsOn}.</p> : null}
      {error ? <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Status
          <select className="mt-1 w-full rounded border px-2 py-1" value={project.status} onChange={(e) => void setStatus(e.target.value as ProjectStatus)}>
            {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Start date
          <input type="date" className="mt-1 w-full rounded border px-2 py-1" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label className="text-sm">
          Delivery date
          <input type="date" className="mt-1 w-full rounded border px-2 py-1" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </label>
      </div>
      {needsForce ? (
        <button type="button" className="rounded border border-amber-500 px-3 py-1 text-sm" onClick={() => void setStatus(needsForce, true)}>
          Mark delivered anyway
        </button>
      ) : null}

      <label className="block text-sm">
        Notes shown to the client
        <textarea className="mt-1 w-full rounded border px-2 py-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button type="button" className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground" onClick={() => void save({ startsOn: startsOn || null, deliveryDate: deliveryDate || null, clientNotes: notes })}>
        Save dates and notes
      </button>

      <MilestoneEditor
        milestones={milestones}
        onAdd={(title, dueOn) => void guard(async () => { await api.post(`${BASE}/${project.id}/milestones`, { title, dueOn }); await reload(); })}
        onToggle={(m) => void guard(async () => { await api.patch(`${BASE}/${project.id}/milestones/${m.id}`, { done: !m.done }); await reload(); })}
        onMove={(m, d) => void move(m, d)}
        onDelete={(m) => void guard(async () => { await api.del(`${BASE}/${project.id}/milestones/${m.id}`); await reload(); })}
      />

      <HandoverChecklist handover={project.handover} onChange={(k: HandoverKey, v) => void save({ handover: { [k]: v } })} />

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void statusLink(false)}>
          Copy status link
        </button>
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void statusLink(true)}>
          Email status link
        </button>
      </div>
    </div>
  );
}
