import type { ConfigField } from "./types";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "txt"];
const UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg", "text/plain"];

/** Returns the message key of the problem with a file, or null when it may be sent. The server checks again. */
export function checkUploadFile(file: { name: string; size: number; type: string }): "badType" | "tooBig" | "empty" | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const typeOk = UPLOAD_TYPES.includes(file.type) || ((file.type === "" || file.type === "application/octet-stream") && UPLOAD_EXTENSIONS.includes(ext));
  if (!typeOk) return "badType";
  if (file.size <= 0) return "empty";
  if (file.size > MAX_UPLOAD_BYTES) return "tooBig";
  return null;
}

export function formatWhen(value: string | null | undefined, locale: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function hoursFromMinutes(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return String(h);
}

/** Whole minutes left until a moment, never negative. */
export function minutesLeft(expiresAt: string, now = Date.now()): number {
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((t - now) / 60000));
}

function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-.]+/g, " ").trim().toLowerCase();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function scalar(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export interface ProposalRow {
  label: string;
  value: string;
}

/** Turns the exact proposal into rows a person can read: nested values get a "Parent: child" label, lists are joined. */
export function proposalRows(proposal: unknown, prefix = "", depth = 0): ProposalRow[] {
  if (!proposal || typeof proposal !== "object") return [];
  const rows: ProposalRow[] = [];
  for (const [key, value] of Object.entries(proposal as Record<string, unknown>)) {
    const label = prefix ? `${prefix}: ${humanize(key)}` : humanize(key);
    if (Array.isArray(value)) {
      if (value.every((x) => x === null || typeof x !== "object")) rows.push({ label, value: value.map(scalar).join(", ") || "-" });
      else value.forEach((item, i) => rows.push(...(depth < 3 ? proposalRows(item, `${label} ${i + 1}`, depth + 1) : [{ label: `${label} ${i + 1}`, value: scalar(JSON.stringify(item)) }])));
    } else if (value && typeof value === "object") {
      rows.push(...(depth < 3 ? proposalRows(value, label, depth + 1) : [{ label, value: scalar(JSON.stringify(value)) }]));
    } else rows.push({ label, value: scalar(value) });
  }
  return rows;
}

/** The starting values of the settings form: what is saved, else the template's default. */
export function initialConfigValues(fields: ConfigField[], saved: Record<string, unknown> | undefined): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const f of fields) {
    const v = saved && saved[f.key] !== undefined ? saved[f.key] : f.default;
    if (f.type === "boolean") out[f.key] = v === true || v === "true";
    else out[f.key] = v === undefined || v === null ? "" : String(v);
  }
  return out;
}

/** What is sent to the gateway: empty optional fields are left out, numbers are real numbers. */
export function buildConfig(fields: ConfigField[], values: Record<string, string | boolean>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === "boolean") out[f.key] = v === true;
    else if (typeof v === "string" && v.trim() !== "") out[f.key] = f.type === "number" ? Number(v) : v.trim();
  }
  return out;
}
