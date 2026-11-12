import { AUDIT_SECTIONS } from './audit-form-definition.js';
import { assembleReport, detectLang, isUsable, type AuditReport, type Lang, type RawDraft } from './audit-report.js';
import type { Assessment, Quote } from './audit-estimate.js';

/**
 * The AI draft of an audit report. The model reads the client's answers and returns JSON: the words of the report and a few labelled facts (the Assessment).
 * It is told never to write prices or hours; audit-report.ts removes any that slip through and audit-estimate.ts works the fee out. A person reviews the result before it is sent.
 */
export type LlmFn = (system: string, user: string) => Promise<string>;

const MODEL = () => process.env.AUDIT_REPORT_MODEL || 'gpt-4o';

export async function openAiJson(system: string, user: string, env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): Promise<string> {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL(),
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');
  return content;
}

export const SYSTEM_PROMPT = (lang: Lang): string => `You are a senior AI-systems consultant at Halla AI, a consultancy in the UAE that designs and builds AI automation for small and medium companies in the Gulf.
You are writing the draft of a paid Opportunity Audit for one client, using ONLY the questionnaire answers you are given. A colleague will review and edit your draft before the client sees it.

Rules:
- Write every piece of text in ${lang === 'ar' ? 'clear, professional Modern Standard Arabic suitable for Gulf business readers. Start every text field, every list item and every opportunity title with an Arabic word (for example "شركة Acme", never "Acme" first), because the PDF cannot lay out a line that starts with a Latin word' : 'clear, plain, professional English'}. Keep company and tool names as written.
- Use only facts found in the answers. If something important is missing or unclear, do not guess: add a short line to "considerations" saying what must be confirmed.
- NEVER write any price, fee, cost, budget figure or number of hours or days of work anywhere in the text. Prices are added later by our system.
- Be specific to this client's own process and tools. No generic filler, no hype, no promises of exact savings. Describe the expected payoff in words (time saved, fewer errors, faster response).
- Opportunities: 3 to 5, most valuable first. Each has a short title, the problem today, the proposed automation, and the payoff.
- phaseDeliverables: three lists, one per phase, 2 to 5 short deliverables each: (1) Architecture and API discovery, (2) core build and AI integration, (3) testing, human-in-the-loop QA and deployment.

Also fill "assessment" with labelled facts read from the answers:
- complexity: "low" (cloud tools with open APIs, uniform inputs, few edge cases, no legacy), "medium" (custom API integrations, mixed documents needing light AI parsing, a few approval steps, multi-step workflows) or "high" (legacy or on-premise systems, heavy unstructured data, strict regional compliance, complex multi-role approvals). If unsure choose the higher tier.
- volume: "high" if more than 5,000 items a month, "low" if fewer, else "unknown".
- dataFormat: "structured", "mixed", "messy" or "unknown".
- systems: "cloud" (cloud tools with accessible APIs), "mixed", "legacy" (older or on-premise systems) or "unknown".
- humanApproval: true if a person must review or approve some steps.
- budgetMaxAed: the top of the budget range they gave, as a plain number in AED, or null if none is given. "under AED 10k" means 10000.

Return one JSON object with exactly these keys: assessment, summary, findings, opportunities, phaseDeliverables, considerations, nextSteps.
summary is 3 to 5 sentences. findings is 3 to 6 short strings about how things work today. nextSteps is 2 to 4 short strings.
opportunities is a list of {title, problem, solution, payoff}. phaseDeliverables is a list of three lists of strings.`;

export function formatAnswers(answers: Record<string, string>): string {
  const lines: string[] = [];
  for (const section of AUDIT_SECTIONS) {
    const rows = section.questions.filter((q) => answers[q.id]).map((q) => `Q: ${q.label}\nA: ${answers[q.id]}`);
    if (rows.length) lines.push(`## ${section.title}\n${rows.join('\n\n')}`);
  }
  return lines.join('\n\n');
}

export interface DraftResult {
  report: AuditReport;
  assessment: Assessment;
  quote: Quote;
}

/** Returns null when the AI call fails or the draft is an empty shell; the caller then marks the audit "draft failed" and tells the team. */
export async function draftAuditReport(args: {
  answers: Record<string, string>;
  company: string;
  contactName: string;
  llm?: LlmFn;
  now?: Date;
}): Promise<DraftResult | null> {
  const lang = detectLang(args.answers);
  const llm = args.llm ?? ((s, u) => openAiJson(s, u));
  let raw: RawDraft;
  try {
    const text = await llm(SYSTEM_PROMPT(lang), `Client company: ${args.company}\n\n${formatAnswers(args.answers)}`);
    raw = JSON.parse(text) as RawDraft;
  } catch {
    return null;
  }
  const out = assembleReport({ raw, lang, company: args.company, contactName: args.contactName, now: args.now ?? new Date() });
  return isUsable(out.report) ? out : null;
}
