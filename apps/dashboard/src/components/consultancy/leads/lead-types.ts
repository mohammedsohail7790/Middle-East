export const LEAD_STATUSES = ["new", "approved", "form_sent", "form_received", "audit_in_review", "audit_paid", "proposal_sent", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  approved: "Approved",
  form_sent: "Form sent",
  form_received: "Form received",
  audit_in_review: "Audit in review",
  audit_paid: "Audit paid",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
};

export const SOURCE_LABEL: Record<string, string> = {
  fit_check: "Fit check",
  consult_request: "Call request",
  manual: "Added by hand",
};

export interface Lead {
  id: string;
  source: string;
  company: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  status: LeadStatus;
  notes: string | null;
  owner_email: string | null;
  created_at: string;
  updated_at: string;
  answers?: Record<string, unknown>;
}

export interface AuditSummary {
  id: string;
  status: string;
  summary: string | null;
  fee_aed: number | null;
  approved_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
}

export interface LeadList {
  items: Lead[];
  total: number;
  counts: Record<LeadStatus, number>;
}

export interface LeadDetail {
  lead: Lead;
  audit: AuditSummary | null;
}

export const leadTitle = (l: Pick<Lead, "company" | "contact_name" | "email">) => l.company || l.contact_name || l.email || "Unnamed";

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
