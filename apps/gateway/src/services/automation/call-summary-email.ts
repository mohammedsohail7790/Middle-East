/**
 * The email a business owner gets after every call: who called, what they needed, what was booked, and whether it was urgent.
 * Pure (no database, no network) so it can be tested; the sending lives in AutomationService.sendOwnerCallSummary.
 */
import { renderBrandedEmail, renderCallout, renderDetailList, renderQuote, renderSummaryStrip } from './email-template.js';
import { getDashboardBaseUrl } from '../integrations/oauth-redirect.js';

export interface CallSummaryInput {
  companyName: string;
  callerName?: string;
  callerPhone?: string;
  service?: string;
  /** Plain-language summary of the call. */
  summary?: string;
  outcome: string;
  durationMs: number;
  sentiment?: string;
  leadQuality?: string;
  /** What was booked, when something was. */
  appointment?: string;
  /** The caller described an emergency, or the safety supervisor stepped in. */
  urgent?: boolean;
  /** False when the caller did not consent to their details being kept: the email then says a call took place and nothing more. */
  includePersonalDetails: boolean;
}

const OUTCOME_LABEL: Record<string, string> = {
  completed: 'Handled by the AI',
  transferred: 'Transferred to your team',
  missed: 'Missed',
  voicemail: 'Message taken',
  abandoned: 'Caller hung up early',
};

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function callSummarySubject(input: CallSummaryInput): string {
  const who = input.includePersonalDetails ? input.callerName || input.callerPhone || 'Unknown caller' : 'a caller';
  const outcome = OUTCOME_LABEL[input.outcome] ?? titleCase(input.outcome);
  return input.urgent ? `URGENT call: ${who}` : `New call: ${who} · ${outcome}`;
}

export function renderCallSummaryEmail(input: CallSummaryInput): { subject: string; html: string } {
  const outcome = OUTCOME_LABEL[input.outcome] ?? titleCase(input.outcome);
  const personal = input.includePersonalDetails;

  const callout = input.urgent
    ? renderCallout({
        tone: 'bad',
        label: 'Urgent',
        headline: 'The caller described an urgent situation.',
        points: ['Please contact them as soon as you can.', ...(personal && input.callerPhone ? [`Call back: ${input.callerPhone}`] : [])],
      })
    : renderCallout({
        tone: input.outcome === 'transferred' ? 'warn' : 'good',
        label: 'Call summary',
        headline: input.outcome === 'transferred' ? 'This call was passed to your team.' : 'The AI receptionist handled this call.',
        points: input.appointment && personal ? [`Booked: ${input.appointment}`] : undefined,
      });

  const strip = renderSummaryStrip([
    { label: 'Outcome', value: outcome },
    { label: 'Duration', value: formatDuration(input.durationMs) },
    ...(input.sentiment ? [{ label: 'Mood', value: titleCase(input.sentiment) }] : []),
    ...(input.leadQuality ? [{ label: 'Lead', value: titleCase(input.leadQuality) }] : []),
  ]);

  const rows = personal
    ? [
        { label: 'Caller', value: input.callerName || 'Not given' },
        { label: 'Phone', value: input.callerPhone || 'Not given' },
        ...(input.service ? [{ label: 'Needed', value: input.service }] : []),
        ...(input.appointment ? [{ label: 'Booked', value: input.appointment }] : []),
      ]
    : [];

  const note = personal
    ? ''
    : `<p style="margin: 18px 0 0; font-size: 13px; color: #6B6B70;">The caller did not agree to their details being kept, so none are shown.</p>`;

  const quote = personal && input.summary ? renderQuote('What the call was about', input.summary) : '';

  const html = renderBrandedEmail({
    eyebrow: input.urgent ? 'Urgent call' : 'New call',
    title: `Call for ${input.companyName}`,
    preheader: personal && input.summary ? input.summary.slice(0, 120) : `${outcome}, ${formatDuration(input.durationMs)}.`,
    bodyHtml: callout + strip + (rows.length ? renderDetailList(rows, 'Details') : '') + quote + note,
    ctaLabel: 'Open the call in your dashboard',
    ctaUrl: `${getDashboardBaseUrl()}/en/dashboard/calls`,
    headerLabel: '',
  });

  return { subject: callSummarySubject(input), html };
}
