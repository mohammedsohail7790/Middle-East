import { voiceDb } from '../voice/tenant-scope.js';
import { knowledgeService } from '../knowledge/knowledge.service.js';
import { logger } from '../logger.js';
import { HALLA_AI_ASSISTANT_GUIDE } from './dashboard-assistant-knowledge.js';
import { resolvePageContext } from './dashboard-page-catalog.js';
import { scanPromptInjection, sanitizeUntrustedText } from '../../security/prompt-safety.js';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantChatParams {
  tenantId: string;
  messages: AssistantMessage[];
  page?: string;
  pageTitle?: string;
}

const TENANT_CACHE_MS = 45_000;
const tenantSnippetCache = new Map<string, { at: number; text: string }>();

/** Drop UI seed greeting and empty placeholders before sending to the model. */
export function messagesForModel(messages: AssistantMessage[]): AssistantMessage[] {
  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0)
    .filter((m, i) => {
      if (i !== 0 || m.role !== 'assistant') return true;
      return !/call iq assistant|call iq guide/i.test(m.content);
    })
    .map((m) => ({
      role: m.role,
      content: sanitizeUntrustedText(m.content.trim(), 4000),
    }))
    .slice(-14);
}

async function loadTenantSnippet(tenantId: string): Promise<string> {
  const cached = tenantSnippetCache.get(tenantId);
  if (cached && Date.now() - cached.at < TENANT_CACHE_MS) return cached.text;

  try {
    const [tenantRes, statsRes, subRes, knowledgeRes, phonesRes] = await Promise.all([
      voiceDb.query(
        `select vt.company_name, vt.phone_number, ac.agent_name, ac.services_offered
         from public.voice_tenants vt
         left join public.ai_agent_configs ac on ac.tenant_id = vt.id
         where vt.id = $1 limit 1`,
        [tenantId]
      ),
      voiceDb.query(
        `select
           count(*)::int as calls_total,
           count(*) filter (where created_at > now() - interval '7 days')::int as calls_7d,
           count(*) filter (where created_at > now() - interval '1 day')::int as calls_24h
         from public.calls where tenant_id = $1`,
        [tenantId]
      ).catch(() => ({ rows: [{ calls_total: 0, calls_7d: 0, calls_24h: 0 }] })),
      voiceDb
        .query(
          `select plan, status from public.billing_subscriptions
           where tenant_id = $1 order by created_at desc limit 1`,
          [tenantId]
        )
        .catch(() => ({ rows: [] })),
      voiceDb
        .query(`select count(*)::int as n from public.knowledge_base where tenant_id = $1`, [tenantId])
        .catch(() => ({ rows: [{ n: 0 }] })),
      voiceDb
        .query(`select count(*)::int as n from public.tenant_phone_numbers where tenant_id = $1`, [
          tenantId,
        ])
        .catch(() => ({ rows: [{ n: 0 }] })),
    ]);

    if (!tenantRes.rows.length) return '';
    const r = tenantRes.rows[0] as Record<string, unknown>;
    const stats = statsRes.rows[0] as {
      calls_total?: number;
      calls_7d?: number;
      calls_24h?: number;
    };
    const sub = subRes.rows[0] as { plan?: string; status?: string } | undefined;
    const knowledgeCount = (knowledgeRes.rows[0] as { n?: number })?.n ?? 0;
    const phoneCount = (phonesRes.rows[0] as { n?: number })?.n ?? 0;

    const services = Array.isArray(r.services_offered)
      ? (r.services_offered as string[]).slice(0, 8).join(', ')
      : '';

    const text = [
      `Company: ${r.company_name || 'Unknown'}`,
      r.phone_number ? `Main line: ${r.phone_number}` : null,
      r.agent_name ? `AI agent name: ${r.agent_name}` : null,
      services ? `Services: ${services}` : null,
      sub?.plan ? `Plan: ${sub.plan} (${sub.status || 'unknown'})` : null,
      `Total calls: ${stats?.calls_total ?? 0}`,
      `Calls last 7 days: ${stats?.calls_7d ?? 0}`,
      `Calls last 24h: ${stats?.calls_24h ?? 0}`,
      `Knowledge entries: ${knowledgeCount}`,
      `Phone numbers provisioned: ${phoneCount}`,
    ]
      .filter(Boolean)
      .join('\n');

    tenantSnippetCache.set(tenantId, { at: Date.now(), text });
    return text;
  } catch {
    return '';
  }
}

async function loadPageSnapshot(tenantId: string, page?: string): Promise<string> {
  const path = (page || '/dashboard').split('?')[0].replace(/\/$/, '') || '/dashboard';
  const lines: string[] = [];

  try {
    if (path.startsWith('/dashboard/calls') || path === '/dashboard') {
      const r = await voiceDb.query(
        `select outcome, count(*)::int as n from public.calls
         where tenant_id = $1 and created_at > now() - interval '14 days'
         group by outcome order by n desc limit 5`,
        [tenantId]
      );
      if (r.rows.length) {
        lines.push(
          'Recent call outcomes (14d): ' +
            r.rows.map((row: { outcome: string | null; n: number }) => `${row.outcome || 'unknown'}: ${row.n}`).join(', ')
        );
      }
    }
    if (path.startsWith('/dashboard/leads') || path === '/dashboard') {
      const r = await voiceDb.query(
        `select status, count(*)::int as n from public.leads
         where tenant_id = $1 group by status order by n desc limit 8`,
        [tenantId]
      );
      if (r.rows.length) {
        lines.push(
          'Lead pipeline: ' +
            r.rows.map((row: { status: string | null; n: number }) => `${row.status || 'new'}: ${row.n}`).join(', ')
        );
      }
    }
    if (path.startsWith('/dashboard/knowledge')) {
      const r = await voiceDb.query(
        `select category, left(content, 80) as preview from public.knowledge_base
         where tenant_id = $1 order by created_at desc limit 5`,
        [tenantId]
      );
      if (r.rows.length) {
        lines.push(
          'Latest knowledge items: ' +
            r.rows
              .map((row: { category: string; preview: string }) => `${row.category}: ${row.preview}…`)
              .join(' | ')
        );
      }
    }
  } catch {
    /* optional snapshot */
  }

  return lines.join('\n');
}

/** Embedding search is slow — only for business-content questions, not navigation. */
function needsKnowledgeRag(question: string): boolean {
  const q = question.toLowerCase();
  if (/^(hi|hello|hey|thanks|thank you)\b/.test(q)) return false;
  if (/dashboard|sidebar|which page|where do i|how do i (find|open|go)|navigate|settings page|billing page/i.test(q)) {
    return false;
  }
  return /hours|pricing|price|service|policy|faq|warranty|company|business info|knowledge base content/i.test(q);
}

export async function buildAssistantSystemPrompt(
  tenantId: string,
  page?: string,
  pageTitle?: string
): Promise<string> {
  const [tenantSnippet, pageSnapshot] = await Promise.all([
    loadTenantSnippet(tenantId),
    loadPageSnapshot(tenantId, page),
  ]);

  const titleLine = pageTitle?.trim()
    ? `User-visible page title: ${pageTitle.trim().slice(0, 80)}`
    : '';

  return [
    HALLA_AI_ASSISTANT_GUIDE,
    resolvePageContext(page),
    titleLine,
    tenantSnippet ? `\nLIVE WORKSPACE DATA:\n${tenantSnippet}` : '',
    pageSnapshot ? `\nPAGE SNAPSHOT:\n${pageSnapshot}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function enrichWithKnowledge(
  tenantId: string,
  userQuestion: string
): Promise<string> {
  if (!needsKnowledgeRag(userQuestion)) return '';
  try {
    const hits = await knowledgeService.searchRelevantKnowledge(userQuestion, tenantId, 3);
    if (!hits.length) return '';
    return hits
      .map((h) => `[${h.category}] ${h.content}`)
      .join('\n\n')
      .slice(0, 1500);
  } catch {
    return '';
  }
}

export async function streamAssistantChat(
  params: AssistantChatParams,
  onDelta: (text: string) => void,
  isCancelled?: () => boolean,
  onStatus?: (status: string) => void
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Assistant unavailable — OPENAI_API_KEY is not configured on the gateway.');
  }

  const messages = messagesForModel(params.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new Error('Send at least one user message.');
  }

  const lastUser = messages[messages.length - 1].content;
  if (scanPromptInjection(lastUser)) {
    throw new Error('Message contains disallowed content.');
  }

  onStatus?.('Scanning your dashboard…');

  const [systemPrompt, kb] = await Promise.all([
    buildAssistantSystemPrompt(params.tenantId, params.page, params.pageTitle),
    enrichWithKnowledge(params.tenantId, lastUser),
  ]);

  let fullSystem = systemPrompt;
  if (kb) {
    fullSystem += `\n\nRELEVANT KNOWLEDGE (your business):\n${kb}`;
  }

  onStatus?.('Thinking…');

  const model = process.env.DASHBOARD_ASSISTANT_MODEL || 'gpt-4o-mini';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 550,
      stream: true,
      messages: [
        { role: 'system', content: fullSystem },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.warn('DASHBOARD_ASSISTANT_OPENAI_ERROR', {
      status: response.status,
      detail: detail.slice(0, 200),
    });
    throw new Error('Assistant could not generate a reply. Try again in a moment.');
  }

  if (!response.body) {
    throw new Error('Empty response from assistant.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  // eslint-disable-next-line no-constant-condition -- stream read loop
  while (true) {
    if (isCancelled?.()) {
      await reader.cancel().catch(() => {});
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* skip malformed SSE chunk */
      }
    }
  }

  return full.trim();
}
