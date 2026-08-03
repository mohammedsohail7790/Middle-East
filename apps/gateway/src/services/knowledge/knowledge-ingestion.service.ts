import { createHash } from 'crypto';
import { knowledgeService } from './knowledge.service.js';
import { logger } from '../logger.js';
import { voiceDb } from '../voice/tenant-scope.js';

export type FileType = 'pdf' | 'docx' | 'txt' | 'csv' | 'website' | 'text' | 'md';

export interface IngestionSource {
    type: FileType;
    name: string;
    content: string;
    metadata?: Record<string, string>;
}

export interface ChunkResult {
    content: string;
    category: string;
    source: string;
    sourceType: FileType;
    chunkIndex: number;
    totalChunks: number;
    tokenEstimate: number;
}

export interface FileRecord {
    id: string;
    tenantId: string;
    fileName: string;
    fileType: FileType;
    fileSize: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    chunkCount: number;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class KnowledgeIngestionService {
    private readonly maxChunkSize = 800;
    private readonly chunkOverlap = 80;

    async ingestFile(
        tenantId: string,
        fileName: string,
        fileType: FileType,
        content: string,
        category?: string
    ): Promise<string> {
        const fileId = this.generateId(fileName, tenantId);

        const fileRecord: FileRecord = {
            id: fileId,
            tenantId,
            fileName,
            fileType,
            fileSize: Buffer.byteLength(content, 'utf-8'),
            status: 'pending',
            chunkCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await this.saveFileRecord(fileRecord);

        setImmediate(() => {
            this.processFile(fileId, tenantId, content, fileType, fileName, category).catch((err) => {
                logger.error('KNOWLEDGE_FILE_PROCESS_FAILED', {
                    fileId,
                    tenantId,
                    fileName,
                    error: String(err),
                });
            });
        });

        return fileId;
    }

    private async processFile(
        fileId: string,
        tenantId: string,
        content: string,
        fileType: FileType,
        fileName: string,
        categoryOverride?: string
    ): Promise<void> {
        await this.updateFileStatus(fileId, 'processing');

        try {
            const normalizedContent =
                fileType === 'csv' ? this.formatCsvForKnowledge(content) : content;
            const chunks = this.chunkContent(
                normalizedContent,
                fileType,
                fileName,
                categoryOverride
            );
            logger.info('KNOWLEDGE_CHUNKING_COMPLETE', {
                fileId,
                tenantId,
                fileName,
                chunkCount: chunks.length,
            });

            let successCount = 0;
            for (const chunk of chunks) {
                try {
                    await knowledgeService.ingestText(
                        chunk.content,
                        chunk.category as any,
                        tenantId
                    );
                    successCount++;
                } catch (chunkErr) {
                    logger.error('KNOWLEDGE_CHUNK_INGEST_FAILED', {
                        fileId,
                        chunkIndex: chunk.chunkIndex,
                        error: String(chunkErr),
                    });
                }
            }

            await this.markFileComplete(fileId, tenantId, chunks.length, successCount);
        } catch (err) {
            await this.markFileFailed(fileId, tenantId, String(err));
            throw err;
        }
    }

    chunkContent(
        content: string,
        sourceType: FileType,
        sourceName: string,
        categoryOverride?: string
    ): ChunkResult[] {
        const category = categoryOverride?.trim() || this.inferCategory(sourceName, content);
        const results: ChunkResult[] = [];

        const paragraphs = this.splitIntoParagraphs(content);
        let currentChunk = '';
        let chunkIndex = 0;

        for (const para of paragraphs) {
            const wouldBeLength = currentChunk.length + para.length + 1;

            if (wouldBeLength > this.maxChunkSize && currentChunk.length > 0) {
                results.push(this.makeChunk(currentChunk, category, sourceName, sourceType, chunkIndex++, results.length));
                currentChunk = '';
            }

            if (para.length > this.maxChunkSize) {
                const subParts = this.splitLongParagraph(para);
                for (const sub of subParts) {
                    if (currentChunk.length > 0) {
                        results.push(this.makeChunk(currentChunk, category, sourceName, sourceType, chunkIndex++, results.length));
                        currentChunk = '';
                    }
                    results.push(this.makeChunk(sub, category, sourceName, sourceType, chunkIndex++, results.length));
                }
                continue;
            }

            currentChunk += (currentChunk ? '\n\n' : '') + para;
        }

        if (currentChunk.trim().length >= 40) {
            results.push(this.makeChunk(currentChunk, category, sourceName, sourceType, chunkIndex++, results.length));
        }

        const totalChunks = results.length;
        return results.map((r) => ({ ...r, totalChunks }));
    }

    private makeChunk(
        content: string,
        category: string,
        source: string,
        sourceType: FileType,
        chunkIndex: number,
        _totalEst: number
    ): ChunkResult {
        return {
            content: content.replace(/\s+/g, ' ').trim(),
            category,
            source,
            sourceType,
            chunkIndex,
            totalChunks: 0,
            tokenEstimate: Math.ceil(content.length / 4),
        };
    }

    private splitIntoParagraphs(text: string): string[] {
        const raw = text.split(/\n\s*\n/);
        const result: string[] = [];
        for (const p of raw) {
            const trimmed = p.trim();
            if (trimmed) result.push(trimmed);
        }
        return result;
    }

    private splitLongParagraph(para: string): string[] {
        const parts: string[] = [];
        const sentences = para.match(/[^.!?\n]+[.!?]+\s*/g) || [para];
        let current = '';

        for (const sentence of sentences) {
            if ((current + sentence).length > this.maxChunkSize && current.length > 0) {
                if (current.trim().length >= 40) parts.push(current.trim());
                current = sentence;
            } else {
                current += sentence;
            }
        }

        if (current.trim().length >= 40) parts.push(current.trim());

        if (parts.length === 0) {
            for (let i = 0; i < para.length; i += this.maxChunkSize) {
                const slice = para.slice(i, i + this.maxChunkSize).trim();
                if (slice.length >= 40) parts.push(slice);
            }
        }

        return parts;
    }

    private inferCategory(name: string, content: string): string {
        const lower = (name + ' ' + content.slice(0, 500)).toLowerCase();

        const categoryKeywords: Record<string, string[]> = {
            hvac: ['hvac', 'heating', 'cooling', 'ac', 'air conditioning', 'furnace', 'thermostat', 'duct', 'ventilation'],
            plumbing: ['plumbing', 'plumber', 'pipe', 'drain', 'toilet', 'faucet', 'water heater', 'sewer', 'leak'],
            electrical: ['electrical', 'electrician', 'wiring', 'circuit', 'breaker', 'outlet', 'lighting', 'panel'],
            general: ['general', 'handyman', 'maintenance', 'repair', 'service', 'appointment', 'scheduling'],
            medical: ['medical', 'doctor', 'clinic', 'patient', 'health', 'dental', 'hospital'],
            legal: ['legal', 'lawyer', 'attorney', 'court', 'firm', 'litigation'],
            real_estate: ['real estate', 'property', 'rental', 'lease', 'mortgage', 'home', 'apartment'],
        };

        let bestMatch = 'general';
        let bestScore = 0;

        for (const [cat, keywords] of Object.entries(categoryKeywords)) {
            let score = 0;
            for (const kw of keywords) {
                if (lower.includes(kw)) score++;
            }
            if (score > bestScore) {
                bestScore = score;
                bestMatch = cat;
            }
        }

        return bestMatch;
    }

    private generateId(fileName: string, tenantId: string): string {
        const hash = createHash('md5').update(`${tenantId}:${fileName}:${Date.now()}`).digest('hex').slice(0, 12);
        return `kb_${hash}`;
    }

    private async saveFileRecord(record: FileRecord): Promise<void> {
        try {
            await voiceDb.query(
                `INSERT INTO public.knowledge_files (id, tenant_id, file_name, file_type, file_size, status, chunk_count, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    record.id,
                    record.tenantId,
                    record.fileName,
                    record.fileType,
                    record.fileSize,
                    record.status,
                    record.chunkCount,
                    record.createdAt,
                    record.updatedAt,
                ]
            );
        } catch (err) {
            logger.warn('KNOWLEDGE_FILES_RECORD_SKIPPED', {
                fileId: record.id,
                tenantId: record.tenantId,
                error: String(err),
            });
        }
    }

    private async updateFileStatus(fileId: string, status: string): Promise<void> {
        try {
            await voiceDb.query(
                `UPDATE public.knowledge_files SET status = $1, updated_at = NOW() WHERE id = $2`,
                [status, fileId]
            );
        } catch {
            /* table optional */
        }
    }

    private async markFileComplete(
        fileId: string,
        tenantId: string,
        totalChunks: number,
        successCount: number
    ): Promise<void> {
        try {
            await voiceDb.query(
                `UPDATE public.knowledge_files SET status = 'completed', chunk_count = $1, updated_at = NOW() WHERE id = $2`,
                [totalChunks, fileId]
            );
        } catch {
            /* table optional */
        }
        logger.info('KNOWLEDGE_FILE_COMPLETED', { fileId, totalChunks, successCount });
        if (successCount > 0) {
            const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
            publishDashboardPushType(tenantId, 'knowledge.updated', [], { fileId, chunks: successCount });
        }
    }

    private async markFileFailed(fileId: string, tenantId: string, error: string): Promise<void> {
        try {
            await voiceDb.query(
                `UPDATE public.knowledge_files SET status = 'failed', error = $1, updated_at = NOW() WHERE id = $2`,
                [error.slice(0, 500), fileId]
            );
        } catch {
            /* table optional */
        }
        logger.error('KNOWLEDGE_FILE_FAILED', { fileId, error });
        const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
        publishDashboardPushType(tenantId, 'knowledge.updated', [], { fileId, failed: true });
    }

    async getFileStatus(fileId: string): Promise<FileRecord | null> {
        const result = await voiceDb.query(
            `SELECT * FROM public.knowledge_files WHERE id = $1`,
            [fileId]
        );
        return result.rows.length ? this.mapFileRecord(result.rows[0]) : null;
    }

    async listFiles(tenantId: string, limit = 100): Promise<FileRecord[]> {
        const capped = Math.min(Math.max(limit, 1), 200);
        const result = await voiceDb.query(
            `SELECT id, tenant_id, filename, mime_type, size_bytes, status, error_message, created_at, updated_at
             FROM public.knowledge_files WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [tenantId, capped]
        );
        return result.rows.map(this.mapFileRecord);
    }

    async deleteFile(fileId: string, tenantId: string): Promise<boolean> {
        const result = await voiceDb.query(
            `DELETE FROM public.knowledge_files WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [fileId, tenantId]
        );
        if (result.rowCount && result.rowCount > 0) {
            await voiceDb.query(
                `DELETE FROM public.knowledge_base WHERE tenant_id = $1 AND source = $2`,
                [tenantId, fileId]
            );
            return true;
        }
        return false;
    }

    async reprocessFile(fileId: string, tenantId: string): Promise<boolean> {
        const file = await this.getFileStatus(fileId);
        if (!file) return false;

        await voiceDb.query(
            `DELETE FROM public.knowledge_base WHERE tenant_id = $1 AND source = $2`,
            [tenantId, fileId]
        );

        await this.updateFileStatus(fileId, 'pending');
        return true;
    }

    normalizeImportUrl(rawUrl: string): string {
        let trimmed = rawUrl.trim();
        if (!trimmed) {
            throw new Error('URL required');
        }
        if (!/^https?:\/\//i.test(trimmed)) {
            trimmed = `https://${trimmed}`;
        }
        return trimmed;
    }

    async ingestWebsite(
        url: string,
        tenantId: string,
        category?: string
    ): Promise<string> {
        try {
            const { assertSafePublicUrl } = await import('../../security/ssrf-guard.js');
            const safeUrl = assertSafePublicUrl(this.normalizeImportUrl(url)).toString();
            const response = await fetch(safeUrl, {
                signal: AbortSignal.timeout(20000),
                redirect: 'follow',
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (compatible; CallIQ/1.0; +https://www.calliqlabs.com) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });

            if (!response.ok) {
                throw new Error(
                    `Could not fetch page (HTTP ${response.status}). Check the URL is public and try again.`
                );
            }

            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            const raw = await response.text();
            const text =
                contentType.includes('html') || raw.trim().startsWith('<')
                    ? this.extractTextFromHtml(raw)
                    : raw.replace(/\s+/g, ' ').trim();

            if (text.length < 120) {
                throw new Error(
                    'Very little text was found on that page. The site may block imports, require login, or load content with JavaScript — try pasting the text manually or upload a .txt/.pdf file.'
                );
            }

            const displayName = (() => {
                try {
                    return new URL(safeUrl).hostname;
                } catch {
                    return safeUrl;
                }
            })();

            return await this.ingestFile(
                tenantId,
                displayName,
                'website',
                text,
                category
            );
        } catch (err) {
            logger.error('KNOWLEDGE_WEBSITE_FETCH_FAILED', {
                url,
                tenantId,
                error: String(err),
            });
            throw err;
        }
    }

    /** Turn CSV rows into readable lines for the AI (pricing sheets, service lists). */
    private formatCsvForKnowledge(raw: string): string {
        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) return raw;

        const parseRow = (line: string): string[] => {
            const cells: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    inQuotes = !inQuotes;
                    continue;
                }
                if (ch === ',' && !inQuotes) {
                    cells.push(current.trim());
                    current = '';
                    continue;
                }
                current += ch;
            }
            cells.push(current.trim());
            return cells.filter((c) => c.length > 0);
        };

        const rows = lines.map(parseRow).filter((r) => r.length > 0);
        if (rows.length === 0) return raw;

        const header = rows[0];
        const dataRows = rows.slice(1);
        const parts: string[] = ['Business knowledge imported from spreadsheet:', ''];

        if (header.length > 0) {
            parts.push(`Columns: ${header.join(' | ')}`);
            parts.push('');
        }

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            if (row.length === 0) continue;
            const labeled = row.map((cell, j) => {
                const label = header[j] || `Field ${j + 1}`;
                return `${label}: ${cell}`;
            });
            parts.push(`Service ${i + 1}: ${labeled.join('; ')}`);
        }

        return parts.join('\n');
    }

    private extractTextFromHtml(html: string): string {
        const mainBlock =
            html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
            html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
            html;

        const scriptsAndStyles = mainBlock
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ');

        const text = scriptsAndStyles
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/li>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return text;
    }

    private mapFileRecord(row: any): FileRecord {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            fileName: row.file_name,
            fileType: row.file_type,
            fileSize: row.file_size,
            status: row.status,
            chunkCount: row.chunk_count || 0,
            error: row.error,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

export const knowledgeIngestionService = new KnowledgeIngestionService();
