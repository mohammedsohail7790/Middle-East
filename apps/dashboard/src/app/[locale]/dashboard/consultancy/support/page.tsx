"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { api, humanizeApiError } from "@/lib/api";
import { SupportPlansTable } from "@/components/consultancy/support/SupportPlansTable";
import { LogHoursForm, type HoursInput } from "@/components/consultancy/support/LogHoursForm";
import { CreatePlanForm, type CreatePlanInput, type LeadOption } from "@/components/consultancy/support/CreatePlanForm";
import { KIND_LABEL, type SupportPlanRow } from "@/components/consultancy/support/types";

const BASE = "/consultancy-admin/support";

export default function Page() {
  const [plans, setPlans] = useState<SupportPlanRow[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [logging, setLogging] = useState<SupportPlanRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<SupportPlanRow[]>(BASE, { fresh: true });
      setPlans(Array.isArray(rows) ? rows : []);
      setError("");
    } catch (e) {
      setError(humanizeApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // The lead picker is a convenience: if the leads list cannot be read, the form asks for a lead ID instead.
    api
      .get<LeadOption[] | { leads?: LeadOption[] }>("/consultancy-admin/leads")
      .then((r) => setLeads(Array.isArray(r) ? r : Array.isArray(r?.leads) ? r.leads : []))
      .catch(() => setLeads([]));
  }, [load]);

  async function create(input: CreatePlanInput) {
    await api.post(BASE, input);
    setMessage("Plan created. Send the payment link when the client is ready.");
    await load();
  }

  async function logHours(input: HoursInput) {
    if (!logging) return;
    const result = await api.post<{ usage: { usedHours: number; includedHours: number; over: boolean } }>(`${BASE}/${logging.id}/hours`, input);
    setMessage(`Saved. ${result.usage.usedHours} of ${result.usage.includedHours} hours used this month${result.usage.over ? ", which is over the plan" : ""}.`);
    setLogging(null);
    await load();
  }

  async function sendLink(plan: SupportPlanRow) {
    setBusyId(plan.id);
    try {
      const r = await api.post<{ url: string; reused: boolean; emailed: string }>(`${BASE}/${plan.id}/checkout`, {});
      const emailNote = r.emailed === "sent" ? "We emailed it to the client." : r.emailed === "skipped" ? "An earlier link is still open, so it was not emailed again." : "The email could not be sent, so copy the link to the client.";
      setMessage(`Payment link: ${r.url}. ${emailNote}`);
    } catch (e) {
      setError(humanizeApiError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(plan: SupportPlanRow) {
    if (!window.confirm(`Cancel ${KIND_LABEL[plan.kind]} for ${plan.company || "this client"}? A monthly plan ends at the end of the month already paid.`)) return;
    setBusyId(plan.id);
    try {
      const r = await api.post<{ cancelsAtPeriodEnd: boolean }>(`${BASE}/${plan.id}/cancel`, {});
      setMessage(r.cancelsAtPeriodEnd ? "The plan will end at the end of the paid month." : "The plan is cancelled.");
      await load();
    } catch (e) {
      setError(humanizeApiError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardPage title="Support plans" description="Monthly plans and hours worked" loading={loading} error={error || undefined} onRetry={load}>
      <div className="space-y-6">
        {message && <p className="rounded border bg-muted/40 p-3 text-sm break-all">{message}</p>}
        <CreatePlanForm leads={leads} onSubmit={create} />
        {logging && <LogHoursForm planName={logging.company || KIND_LABEL[logging.kind]} onSubmit={logHours} onClose={() => setLogging(null)} />}
        <SupportPlansTable plans={plans} busyId={busyId} onLogHours={setLogging} onSendLink={sendLink} onCancel={cancel} />
      </div>
    </DashboardPage>
  );
}
