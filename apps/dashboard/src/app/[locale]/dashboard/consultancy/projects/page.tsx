"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { api, humanizeApiError } from "@/lib/api";
import { ProjectDetail } from "@/components/consultancy/projects/ProjectDetail";
import { ProjectList } from "@/components/consultancy/projects/ProjectList";
import { STATUS_LABEL, type ProjectDetailData, type ProjectStatus, type ProjectSummary } from "@/components/consultancy/projects/types";

const BASE = "/consultancy-admin/projects";
type Accepted = { id: string; title: string; company: string | null; hasProject: boolean };

/** Team-only: delivery projects, milestones and handover. Plain English on purpose (not in the translated message files). */
export default function Page() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [accepted, setAccepted] = useState<Accepted[]>([]);
  const [selected, setSelected] = useState<ProjectDetailData | null>(null);
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (overdueOnly) qs.set("overdue", "1");
    if (search.trim()) qs.set("search", search.trim());
    try {
      const [list, acc] = await Promise.all([api.get<ProjectSummary[]>(`${BASE}?${qs}`, { fresh: true }), api.get<Accepted[]>(`${BASE}/accepted-proposals`, { fresh: true })]);
      setProjects(Array.isArray(list) ? list : []);
      setAccepted(Array.isArray(acc) ? acc : []);
      setError(null);
    } catch (e) {
      setError(humanizeApiError(e));
    } finally {
      setLoading(false);
    }
  }, [status, overdueOnly, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    try {
      setSelected(await api.get<ProjectDetailData>(`${BASE}/${id}`, { fresh: true }));
    } catch (e) {
      setError(humanizeApiError(e));
    }
  };

  const create = async () => {
    if (!proposalId) return;
    try {
      const p = await api.post<ProjectDetailData>(`${BASE}`, { proposalId });
      setProposalId("");
      await load();
      await open(p.id);
    } catch (e) {
      setError(humanizeApiError(e));
    }
  };

  const available = accepted.filter((a) => !a.hasProject);

  return (
    <DashboardPage title="Projects" description="Delivery dates, milestones and handover" loading={loading} error={error ?? undefined} onRetry={() => void load()}>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Create from accepted proposal
          <select className="mt-1 block rounded border px-2 py-1" value={proposalId} onChange={(e) => setProposalId(e.target.value)}>
            <option value="">Choose a proposal</option>
            {available.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.company ?? "no company"})
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!proposalId} onClick={() => void create()} className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50">
          Create project
        </button>
        <span className="mx-2 hidden h-6 border-l sm:block" />
        <input aria-label="Search projects" className="rounded border px-2 py-1 text-sm" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by status" className="rounded border px-2 py-1 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ProjectList projects={projects} selectedId={selected?.id} onSelect={(id) => void open(id)} />
        {selected ? (
          <ProjectDetail
            project={selected}
            onChanged={(p) => {
              setSelected(p);
              void load();
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Pick a project to see its milestones and handover.</p>
        )}
      </div>
    </DashboardPage>
  );
}
