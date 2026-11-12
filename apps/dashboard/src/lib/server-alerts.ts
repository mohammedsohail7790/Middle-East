/**
 * The business's saved alerts, as the dashboard shows them. The bell used to show only live events and forgot them when the page closed; these come from the server
 * (GET /alerts), in Arabic or English according to the dashboard language.
 */
export type ServerAlert = {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  title_ar: string | null;
  body: string;
  body_ar: string | null;
  href: string;
  created_at: string;
  read_at: string | null;
};

export type AlertView = { id: string; severity: ServerAlert["severity"]; title: string; body: string; href: string; at: string; read: boolean };

/** Arabic text when the dashboard is in Arabic and the alert has it; English otherwise. */
export function toAlertView(a: ServerAlert, locale: string): AlertView {
  const ar = locale === "ar";
  return {
    id: a.id,
    severity: a.severity,
    title: (ar && a.title_ar) || a.title,
    body: (ar && a.body_ar) || a.body,
    href: a.href || "/dashboard",
    at: a.created_at,
    read: a.read_at !== null && a.read_at !== undefined,
  };
}

export const SEVERITY_DOT: Record<ServerAlert["severity"], string> = {
  info: "bg-sky-500",
  warning: "bg-amber-500",
  critical: "bg-red-600",
};

/** The same alert is never listed twice, and unread ones with the most serious problems come first, then newest. */
export function sortAlerts(list: AlertView[]): AlertView[] {
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return [...list].sort((x, y) => Number(x.read) - Number(y.read) || (x.read ? 0 : rank[x.severity] - rank[y.severity]) || new Date(y.at).getTime() - new Date(x.at).getTime());
}
