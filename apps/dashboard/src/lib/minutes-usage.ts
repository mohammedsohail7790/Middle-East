/**
 * "How many minutes are left?" for the dashboard home. One endpoint (GET /billing/account-state) already combines the trial and the paid plan: during a trial it carries the
 * trial minutes, otherwise the minutes included in the plan. This turns it into what the strip shows.
 */
export type MinutesTone = "ok" | "warn" | "critical";

export interface MinutesOverview {
  used: number;
  limit: number;
  /** 0 when there is no limit to measure against, otherwise 0 to 100 (the bar never overflows). */
  percent: number;
  left: number;
  over: number;
  tone: MinutesTone;
  hasLimit: boolean;
  trialing: boolean;
  daysRemaining: number | null;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

export function minutesOverview(state: unknown): MinutesOverview | null {
  const s = (state && typeof state === "object" ? state : null) as { usage?: Record<string, unknown>; trial?: Record<string, unknown> } | null;
  if (!s?.usage) return null;
  const used = Math.round(n(s.usage.callMinutes));
  const limit = Math.round(n(s.usage.limitMinutes));
  const trialing = s.trial?.isTrialing === true;
  const hasLimit = limit > 0;
  const raw = hasLimit ? (used / limit) * 100 : 0;
  return {
    used,
    limit,
    percent: Math.min(100, Math.round(raw)),
    left: hasLimit ? Math.max(0, limit - used) : 0,
    over: hasLimit ? Math.max(0, used - limit) : 0,
    tone: raw >= 100 ? "critical" : raw >= 80 ? "warn" : "ok",
    hasLimit,
    trialing,
    daysRemaining: trialing && typeof s.trial?.daysRemaining === "number" ? Math.max(0, Math.round(s.trial.daysRemaining as number)) : null,
  };
}
