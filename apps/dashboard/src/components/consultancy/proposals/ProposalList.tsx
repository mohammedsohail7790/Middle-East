"use client";

import { Button } from "@/components/ui/button";
import { formatMoney, type Proposal } from "./proposal-utils";

interface Props {
  proposals: Proposal[];
  leadNames?: Record<string, string>;
  onSend: (p: Proposal) => void;
  onWithdraw: (p: Proposal) => void;
  onCopyLink: (p: Proposal) => void;
}

const date = (v: string | null): string => (v ? new Date(v).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC" : "");

/** The proposals with their status, the actions that apply to each status, and the acceptance evidence once a client has accepted. */
export function ProposalList({ proposals, leadNames = {}, onSend, onWithdraw, onCopyLink }: Props) {
  if (proposals.length === 0) return <p className="text-sm text-muted-foreground">No proposals yet.</p>;
  return (
    <ul className="space-y-3">
      {proposals.map((p) => (
        <li key={p.id} className="rounded-xl border border-border p-4" data-testid={`proposal-${p.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{p.title}</p>
              <p className="text-sm text-muted-foreground">
                {leadNames[p.lead_id] ?? p.lead_id} · {formatMoney(p.total_minor, p.currency)} · valid until {date(p.valid_until)}
              </p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium capitalize" aria-label="Status">
              {p.status}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.status === "draft" && (
              <Button size="sm" onClick={() => onSend(p)}>
                Send
              </Button>
            )}
            {(p.status === "draft" || p.status === "sent") && (
              <Button size="sm" variant="outline" onClick={() => onWithdraw(p)}>
                Withdraw
              </Button>
            )}
            {p.status === "sent" && (
              <Button size="sm" variant="outline" onClick={() => onCopyLink(p)}>
                Copy client link
              </Button>
            )}
          </div>
          {p.status === "declined" && p.declined_reason && <p className="mt-2 text-sm">Reason given: {p.declined_reason}</p>}
          {p.status === "accepted" && (
            <dl className="mt-3 grid gap-1 rounded-lg bg-secondary/50 p-3 text-sm" aria-label="Acceptance evidence">
              <div><dt className="inline font-medium">Accepted by: </dt><dd className="inline">{p.accepted_name}</dd></div>
              <div><dt className="inline font-medium">When: </dt><dd className="inline">{date(p.accepted_at)}</dd></div>
              <div><dt className="inline font-medium">IP address: </dt><dd className="inline">{p.accepted_ip ?? "unknown"}</dd></div>
              <div><dt className="inline font-medium">Browser: </dt><dd className="inline break-all">{p.accepted_user_agent ?? "unknown"}</dd></div>
              <div><dt className="inline font-medium">Terms fingerprint: </dt><dd className="inline break-all font-mono text-xs">{p.terms_hash}</dd></div>
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}
