import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';
import { knowledgeCache } from './knowledge.cache.js';

export type KnowledgeCategory = 'hvac' | 'plumbing' | 'electrical' | 'general' | 'medical' | 'legal' | 'real_estate';

export interface KnowledgeChunk {
    category: KnowledgeCategory;
    content: string;
}

function hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

function isMissingKnowledgeSourceColumn(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /column.*["']?source["']?.*does not exist|42703/i.test(msg);
}

const TEMPLATE_SOURCE_PREFIX: Record<string, string> = {
    'template:office_hours': 'OFFICE HOURS:',
    'template:services': 'SERVICES OFFERED:',
    'template:pricing': 'PRICING:',
};

function toVectorLiteral(values: number[]): string {
    // pgvector accepts: '[1,2,3]'
    return `[${values.map((v) => Number(v).toFixed(8)).join(',')}]`;
}

export class KnowledgeService {
    private readonly openAiKey = process.env.OPENAI_API_KEY;
    private readonly embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

    chunkText(raw: string): KnowledgeChunk[] {
        const lines = raw.split(/\r?\n/);
        const chunks: KnowledgeChunk[] = [];
        let currentCategory: KnowledgeCategory | null = null;
        let buffer: string[] = [];

        const flush = () => {
            const text = buffer.join('\n').trim();
            buffer = [];
            if (!currentCategory || !text) return;

            // Further split into smaller chunks by blank lines / max length
            const parts = text.split(/\n\s*\n/g).map((p) => p.trim()).filter(Boolean);
            for (const part of parts) {
                if (part.length <= 900) {
                    chunks.push({ category: currentCategory, content: part });
                    continue;
                }
                // Hard wrap overly long parts
                for (let i = 0; i < part.length; i += 900) {
                    const slice = part.slice(i, i + 900).trim();
                    if (slice) chunks.push({ category: currentCategory, content: slice });
                }
            }
        };

        for (const line of lines) {
            const normalized = line.trim().toLowerCase();
            if (normalized.includes('hvac terminology')) {
                flush();
                currentCategory = 'hvac';
                continue;
            }
            if (normalized.includes('plumbing terminology')) {
                flush();
                currentCategory = 'plumbing';
                continue;
            }
            if (normalized.includes('electrical terminology')) {
                flush();
                currentCategory = 'electrical';
                continue;
            }
            buffer.push(line);
        }
        flush();

        // Drop low-signal “tips” sections if they are too long; keep concise bits only.
        return chunks
            .map((c) => ({ ...c, content: c.content.replace(/\s+/g, ' ').trim() }))
            .filter((c) => c.content.length >= 40)
            .slice(0, 4000);
    }

    async generateEmbedding(text: string): Promise<number[]> {
        if (!this.openAiKey) throw new Error('OPENAI_API_KEY required for embeddings');
        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.openAiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.embeddingModel,
                input: text,
            }),
            signal: AbortSignal.timeout(Number(process.env.OPENAI_EMBEDDING_TIMEOUT_MS || 15000)),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`OpenAI embeddings failed (${response.status}): ${body}`);
        }
        const data = (await response.json()) as any;
        const embedding = data.data?.[0]?.embedding as number[] | undefined;
        if (!embedding || !Array.isArray(embedding)) {
            throw new Error('Invalid embedding response');
        }
        return embedding;
    }

    async storeKnowledge(
        chunk: KnowledgeChunk,
        embedding: number[],
        tenantId: string | null,
        source?: string | null
    ): Promise<void> {
        const vector = toVectorLiteral(embedding);
        try {
            await voiceDb.query(
                `insert into public.knowledge_base (tenant_id, category, content, embedding, source)
                 values ($1, $2, $3, $4::vector, $5)`,
                [tenantId, chunk.category, chunk.content, vector, source ?? null]
            );
        } catch (error) {
            if (!isMissingKnowledgeSourceColumn(error)) throw error;
            await voiceDb.query(
                `insert into public.knowledge_base (tenant_id, category, content, embedding)
                 values ($1, $2, $3, $4::vector)`,
                [tenantId, chunk.category, chunk.content, vector]
            );
        }
    }

    async ingestFromFileOnce(): Promise<void> {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const candidates = [
            process.env.KNOWLEDGE_BASE_FILE_PATH,
            path.join(here, '..', '..', '..', '..', '..', '..', 'data', 'knowledge_base.txt'),
            path.join(here, '..', '..', '..', '..', '..', '..', '..', '..', 'data', 'knowledge_base.txt'),
            path.join(here, '..', '..', '..', '..', 'data', 'knowledge_base.txt'),
        ].filter((p): p is string => Boolean(p));

        let filePath: string | null = null;
        for (const candidate of candidates) {
            try {
                await fs.access(candidate);
                filePath = candidate;
                break;
            } catch {
                /* try next */
            }
        }

        if (!filePath) {
            logger.info('Knowledge ingestion skipped — knowledge_base.txt not found', {
                searched: candidates,
            });
            return;
        }

        const raw = await fs.readFile(filePath, 'utf8');
        const contentHash = hashContent(raw);

        // Check if this exact content has already been ingested.
        // Wrapped in try/catch: if RLS blocks the read (misconfigured DB), we
        // fall through and re-ingest rather than crashing the gateway.
        try {
            const existing = await voiceDb.query(
                `select id from public.knowledge_ingestion_runs where source = $1 and content_hash = $2 limit 1`,
                ['knowledge_base.txt', contentHash],
            );
            if (existing.rows.length) {
                logger.info('Knowledge ingestion already completed, skipping', { contentHash });
                return;
            }
        } catch (checkErr) {
            logger.warn('Could not check ingestion runs table (RLS?), proceeding with ingest', {
                error: String(checkErr),
            });
        }

        const chunks = this.chunkText(raw);
        logger.info('Ingesting knowledge chunks', { chunkCount: chunks.length });

        // Store global knowledge with tenant_id = null
        for (const chunk of chunks) {
            const embedding = await this.generateEmbedding(chunk.content);
            await this.storeKnowledge(chunk, embedding, null);
        }

        // Record the run so we skip on next boot — best-effort, non-fatal.
        try {
            await voiceDb.query(
                `insert into public.knowledge_ingestion_runs (source, content_hash) values ($1, $2)
                 on conflict (content_hash) do nothing`,
                ['knowledge_base.txt', contentHash],
            );
        } catch (recordErr) {
            logger.warn('Could not record ingestion run (RLS?), ingest will repeat on next boot', {
                error: String(recordErr),
            });
        }

        logger.info('Knowledge ingestion completed', { contentHash, chunkCount: chunks.length });
    }

    async searchRelevantKnowledge(query: string, tenantId: string, topK: number = 5): Promise<KnowledgeChunk[]> {
        if (!query || query.trim().length === 0) return [];

        const cached = await knowledgeCache.get(query, tenantId);
        if (cached) {
            return cached.results.map(r => ({
                category: r.category as KnowledgeCategory,
                content: r.content,
            }));
        }

        const embedding = await this.generateEmbedding(query);
        const vector = toVectorLiteral(embedding);

        let result = await voiceDb.query(
            `
            select category, content
            from public.knowledge_base
            where tenant_id = $1
            order by embedding <=> $2::vector
            limit $3
            `,
            [tenantId, vector, topK]
        );

        if (result.rows.length === 0) {
            result = await voiceDb.query(
                `
                select category, content
                from public.knowledge_base
                where tenant_id is null
                order by embedding <=> $2::vector
                limit $3
                `,
                [tenantId, vector, topK]
            );
            if (result.rows.length > 0) {
                logger.warn('[Knowledge] No tenant-specific hits; using shared corpus', { tenantId });
            }
        }

        const items = result.rows.map((r: any) => ({
            category: r.category as KnowledgeCategory,
            content: String(r.content),
        }));

        await knowledgeCache.set(query, tenantId, items);

        return items;
    }

    async listKnowledge(tenantId: string): Promise<any[]> {
        try {
            const result = await voiceDb.query(
                `select id, category, content, source, created_at 
                 from public.knowledge_base 
                 where tenant_id = $1 
                 order by created_at desc`,
                [tenantId]
            );
            return result.rows;
        } catch (error) {
            if (!isMissingKnowledgeSourceColumn(error)) throw error;
            logger.warn('[Knowledge] source column missing — list without source (run migration 040)', {
                tenantId,
            });
            const result = await voiceDb.query(
                `select id, category, content, created_at 
                 from public.knowledge_base 
                 where tenant_id = $1 
                 order by created_at desc`,
                [tenantId]
            );
            return result.rows.map((row) => ({ ...row, source: null }));
        }
    }

    async deleteKnowledge(id: string, tenantId: string): Promise<boolean> {
        const result = await voiceDb.query(
            `delete from public.knowledge_base where id = $1 and tenant_id = $2 returning id`,
            [id, tenantId]
        );
        return result.rowCount !== null && result.rowCount > 0;
    }

    async ingestText(
        text: string,
        category: KnowledgeCategory,
        tenantId: string,
        source?: string | null
    ): Promise<void> {
        if (!text || text.trim().length === 0) return;

        const parts = text.split(/\n\s*\n/g).map((p) => p.trim()).filter(Boolean);
        const chunks: KnowledgeChunk[] = [];

        for (const part of parts) {
            if (part.length <= 900) {
                chunks.push({ category, content: part });
            } else {
                for (let i = 0; i < part.length; i += 900) {
                    const slice = part.slice(i, i + 900).trim();
                    if (slice) chunks.push({ category, content: slice });
                }
            }
        }

        for (const chunk of chunks) {
            const embedding = await this.generateEmbedding(chunk.content);
            await this.storeKnowledge(chunk, embedding, tenantId, source);
        }
    }

    /** Replace auto-generated template chunks (office hours, services, pricing). */
    async syncTemplateKnowledge(
        tenantId: string,
        source: string,
        text: string,
        category: KnowledgeCategory = 'general'
    ): Promise<void> {
        try {
            await voiceDb.query(
                `delete from public.knowledge_base where tenant_id = $1 and source = $2`,
                [tenantId, source]
            );
        } catch (error) {
            if (!isMissingKnowledgeSourceColumn(error)) throw error;
            const prefix = TEMPLATE_SOURCE_PREFIX[source];
            if (prefix) {
                await voiceDb.query(
                    `delete from public.knowledge_base
                     where tenant_id = $1 and content like $2`,
                    [tenantId, `${prefix}%`]
                );
            }
        }
        if (!text.trim()) return;
        await this.ingestText(text, category, tenantId, source);
    }
}

export const knowledgeService = new KnowledgeService();

