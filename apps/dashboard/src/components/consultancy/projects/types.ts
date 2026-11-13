export type ProjectStatus = "planned" | "in_progress" | "delivered" | "on_hold" | "cancelled";
export type HandoverKey = "code" | "data" | "accounts" | "documentation";
export type Handover = Record<HandoverKey, boolean>;

export interface Milestone {
  id: string;
  title: string;
  dueOn: string | null;
  done: boolean;
  note: string | null;
  position: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  company: string | null;
  status: ProjectStatus;
  startsOn: string | null;
  deliveryDate: string | null;
  deliveredAt: string | null;
  handover: Handover;
  clientNotes: string | null;
  overdue: boolean;
  warrantyEndsOn: string | null;
  milestoneTotal?: number;
  milestoneDone?: number;
}

export interface ProjectDetailData extends ProjectSummary {
  milestones: Milestone[];
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  delivered: "Delivered",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

export const HANDOVER_LABEL: Record<HandoverKey, string> = {
  code: "Code",
  data: "Data",
  accounts: "Accounts",
  documentation: "Documentation",
};
