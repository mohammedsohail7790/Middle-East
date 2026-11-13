"use client";

import { UsageBar } from "./UsageBar";
import { KIND_LABEL, STATUS_LABEL, moneyText, type SupportPlanRow } from "./types";

export function SupportPlansTable({
  plans,
  busyId,
  onLogHours,
  onSendLink,
  onCancel,
}: {
  plans: SupportPlanRow[];
  busyId?: string | null;
  onLogHours: (plan: SupportPlanRow) => void;
  onSendLink: (plan: SupportPlanRow) => void;
  onCancel: (plan: SupportPlanRow) => void;
}) {
  if (plans.length === 0) return <p className="text-sm text-muted-foreground">No support plans yet. Create one above.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3">Client</th>
            <th className="p-3">Plan</th>
            <th className="p-3">Status</th>
            <th className="p-3">Hours this month</th>
            <th className="p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} className="border-t align-top">
              <td className="p-3">
                <div className="font-medium">{p.company || "Unnamed lead"}</div>
                <div className="text-xs text-muted-foreground">{p.email}</div>
              </td>
              <td className="p-3">
                <div>{KIND_LABEL[p.kind]}</div>
                <div className="text-xs text-muted-foreground">
                  {moneyText(p.price_minor, p.currency)}
                  {p.kind === "training" ? " one-time" : " per month"}
                </div>
              </td>
              <td className="p-3">
                <span className={p.status === "past_due" ? "font-medium text-red-600" : ""}>{STATUS_LABEL[p.status]}</span>
              </td>
              <td className="p-3">{p.hours_included > 0 || p.usage.usedHours > 0 ? <UsageBar usage={p.usage} /> : <span className="text-xs text-muted-foreground">No hours included</span>}</td>
              <td className="p-3">
                <div className="flex flex-wrap gap-2">
                  {p.status !== "cancelled" && (
                    <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-muted" onClick={() => onLogHours(p)}>
                      Log hours
                    </button>
                  )}
                  {p.status === "pending" && (
                    <button type="button" disabled={busyId === p.id} className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50" onClick={() => onSendLink(p)}>
                      Send payment link
                    </button>
                  )}
                  {p.status !== "cancelled" && (
                    <button type="button" disabled={busyId === p.id} className="rounded border px-2 py-1 text-xs text-red-600 hover:bg-muted disabled:opacity-50" onClick={() => onCancel(p)}>
                      Cancel
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
