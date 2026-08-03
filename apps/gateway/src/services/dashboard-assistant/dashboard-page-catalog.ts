/** Full dashboard route map — injected so the assistant can answer per-page questions. */
const PAGE_CATALOG: Record<string, string> = {
  '/dashboard':
    'Overview: live KPIs (calls, leads, conversion), call volume chart, recent calls list, realtime SSE updates.',
  '/dashboard/calls':
    'Calls: paginated call log with transcripts, duration, outcome, recordings. Filter and open call detail.',
  '/dashboard/leads':
    'Leads: kanban pipeline (new → contacted → qualified → appointment → won/lost). Drag cards between stages.',
  '/dashboard/agent':
    'AI Agent: voice, language, greeting, tone, capabilities (book appointment, transfer, knowledge search). Save applies to next call.',
  '/dashboard/calendar':
    'Calendar: appointments booked by the AI from calls. Syncs with connected calendars.',
  '/dashboard/analytics':
    'Analytics: trends and funnel metrics (Professional plan+).',
  '/dashboard/integrations':
    'Integrations: connect CRM, Google Calendar, Slack, webhooks.',
  '/dashboard/knowledge':
    'Knowledge: Step 1 business templates (hours, services, pricing) + document library for live-call RAG. Save templates syncs Settings.',
  '/dashboard/billing':
    'Billing: plan, trial minutes, usage, upgrade checkout, subscription status.',
  '/dashboard/phone-numbers':
    'Phone Numbers: search and provision US Twilio lines, assign to workspace.',
  '/dashboard/settings':
    'Settings: company profile, business hours, services list. Saving syncs Knowledge templates for RAG.',
  '/dashboard/simulator':
    'Simulator: test the AI agent without a live call.',
};

export function resolvePageContext(path?: string): string {
  const raw = (path || '/dashboard').split('?')[0].replace(/\/$/, '') || '/dashboard';
  const exact = PAGE_CATALOG[raw];
  if (exact) return `CURRENT PAGE (${raw}): ${exact}`;

  const segments = raw.split('/').filter(Boolean);
  const parent = segments.length > 2 ? `/${segments.slice(0, 3).join('/')}` : raw;
  const parentCtx = PAGE_CATALOG[parent];
  if (parentCtx) return `CURRENT PAGE (${raw}): ${parentCtx}`;

  return `CURRENT PAGE: ${raw} — use sidebar: Overview, Calls, Leads, AI Agent, Calendar, Knowledge, Billing, Phone Numbers, Settings.`;
}

export const DASHBOARD_PAGES_INDEX = Object.entries(PAGE_CATALOG)
  .map(([path, desc]) => `- ${path}: ${desc}`)
  .join('\n');
