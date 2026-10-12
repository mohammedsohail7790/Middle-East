/**
 * Structured enquiry details a Medical Tourism intake call may collect, so the receiver can match the enquiry against its provider catalogue.
 * Data minimisation: five short, optional, free-text fields and nothing else (never a diagnosis, history, symptom or medication). Every value is
 * trimmed, stripped of control characters and length-capped; an empty result is `undefined`. The same sanitizer runs where the value is captured and
 * again where it is delivered, so a malformed or oversized value can never reach the receiver.
 */
export interface LeadIntake {
  /** The treatment the caller asked about, in their own words (a category such as "dental implants", not a medical history). */
  procedure?: string;
  destination?: string;
  timeframe?: string;
  preferredLanguage?: string;
  preferredContactTime?: string;
}

const LIMITS: Record<keyof LeadIntake, number> = {
  procedure: 80,
  destination: 80,
  timeframe: 80,
  preferredLanguage: 35,
  preferredContactTime: 80,
};

export const INTAKE_KEYS = Object.keys(LIMITS) as (keyof LeadIntake)[];

export function sanitizeIntake(raw: unknown): LeadIntake | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: LeadIntake = {};
  for (const key of INTAKE_KEYS) {
    const v = src[key];
    if (typeof v !== 'string') continue;
    // eslint-disable-next-line no-control-regex
    const clean = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS[key]);
    if (clean) out[key] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}
