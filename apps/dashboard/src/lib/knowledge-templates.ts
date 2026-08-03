/** Types for Knowledge Base structured templates (gateway /knowledge/templates). */

export interface DayHoursRow {
  dayOfWeek: number;
  isOpen: boolean;
  startTime: string;
  endTime: string;
}

export interface ServiceRow {
  name: string;
}

export interface PricingRow {
  service: string;
  price: string;
}

export interface KnowledgeTemplates {
  timezone: string;
  officeHours: DayHoursRow[];
  services: ServiceRow[];
  pricing: PricingRow[];
}

export const WEEKDAYS: { dayOfWeek: number; label: string; short: string }[] = [
  { dayOfWeek: 0, label: "Sunday", short: "Sun" },
  { dayOfWeek: 1, label: "Monday", short: "Mon" },
  { dayOfWeek: 2, label: "Tuesday", short: "Tue" },
  { dayOfWeek: 3, label: "Wednesday", short: "Wed" },
  { dayOfWeek: 4, label: "Thursday", short: "Thu" },
  { dayOfWeek: 5, label: "Friday", short: "Fri" },
  { dayOfWeek: 6, label: "Saturday", short: "Sat" },
];

export function defaultTemplates(): KnowledgeTemplates {
  return {
    timezone: "America/New_York",
    officeHours: WEEKDAYS.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isOpen: d.dayOfWeek >= 1 && d.dayOfWeek <= 5,
      startTime: "09:00",
      endTime: "17:00",
    })),
    services: [{ name: "" }],
    pricing: [{ service: "", price: "" }],
  };
}

export function normalizeTemplates(raw: unknown): KnowledgeTemplates {
  const base = defaultTemplates();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  const officeHours = Array.isArray(r.officeHours)
    ? (r.officeHours as Record<string, unknown>[]).map((row, i) => ({
        dayOfWeek: Number(row.dayOfWeek ?? i) % 7,
        isOpen: row.isOpen !== false,
        startTime: String(row.startTime ?? "09:00").slice(0, 5),
        endTime: String(row.endTime ?? "17:00").slice(0, 5),
      }))
    : base.officeHours;

  const services = Array.isArray(r.services)
    ? (r.services as Record<string, unknown>[])
        .map((s) => ({ name: String(s.name ?? "").trim() }))
        .filter((s) => s.name)
    : [];
  const pricing = Array.isArray(r.pricing)
    ? (r.pricing as Record<string, unknown>[])
        .map((p) => ({
          service: String(p.service ?? "").trim(),
          price: String(p.price ?? "").trim(),
        }))
        .filter((p) => p.service || p.price)
    : [];

  return {
    timezone: String(r.timezone ?? base.timezone),
    officeHours: officeHours.length ? officeHours : base.officeHours,
    services: services.length ? services : [{ name: "" }],
    pricing: pricing.length ? pricing : [{ service: "", price: "" }],
  };
}

/** Hide auto-synced template chunks from the manual knowledge list. */
export function isTemplateKnowledgeSource(source: string | undefined): boolean {
  return Boolean(source?.startsWith("template:"));
}

export function formatOfficeHoursText(hours: DayHoursRow[]): string {
  const lines = [...hours]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((day) => {
      const label = WEEKDAYS.find((d) => d.dayOfWeek === day.dayOfWeek)?.label ?? `Day ${day.dayOfWeek}`;
      if (!day.isOpen) return `${label}: Closed`;
      return `${label}: ${day.startTime} – ${day.endTime}`;
    });
  return `OFFICE HOURS:\n${lines.join("\n")}`;
}

export function formatServicesText(services: ServiceRow[]): string {
  const names = services.map((s) => s.name.trim()).filter(Boolean);
  if (!names.length) return "";
  return `SERVICES OFFERED:\n${names.map((n) => `- ${n}`).join("\n")}`;
}

export function formatPricingText(pricing: PricingRow[]): string {
  const rows = pricing
    .map((p) => ({ service: p.service.trim(), price: p.price.trim() }))
    .filter((p) => p.service && p.price);
  if (!rows.length) return "";
  return `PRICING:\n${rows.map((p) => `- ${p.service}: ${p.price}`).join("\n")}`;
}

export function isTemplatesRouteMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /cannot get.*knowledge\/templates|not found|404/i.test(msg);
}
