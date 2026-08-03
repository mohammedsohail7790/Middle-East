# 07 — KNOWLEDGE BASE SYSTEM

## Overview

Each tenant can upload business-specific knowledge that the AI retrieves during live calls using vector similarity search (RAG).

## Key Files

| File | Purpose |
|------|---------|
| `services/knowledge/knowledge.service.ts` | Core: chunking, embedding, storage, search |
| `services/knowledge/knowledge-ingestion.service.ts` | File processing pipeline |
| `services/knowledge/knowledge.controller.ts` | REST API endpoints |
| `services/knowledge/knowledge.cache.ts` | Redis caching layer |

## Supported Formats

| Format | Processing |
|--------|-----------|
| TXT | Direct text chunking |
| CSV | Row-based chunking |
| PDF | Text extraction + chunking |
| DOCX | Text extraction + chunking |
| Website URL | HTML scraping + text extraction |
| Manual text | Direct ingestion |

## Ingestion Pipeline

### 1. Upload
```
POST /api/v1/knowledge/upload
Body: { fileName, content, fileType }
```

### 2. File Record Created
```sql
INSERT INTO knowledge_files (tenant_id, file_name, file_type, file_size, status)
VALUES ($1, $2, $3, $4, 'pending');
```

### 3. Async Processing
- Status: `pending` → `processing` → `completed` / `failed`
- Runs in background via `setImmediate()`

### 4. Chunking
- Max chunk size: 800 characters
- Overlap: 80 characters
- Split on paragraph boundaries (`\n\n`)
- Hard-wrap for oversized paragraphs

### 5. Embedding Generation
```typescript
// OpenAI Embeddings API
POST https://api.openai.com/v1/embeddings
Model: text-embedding-3-small
Output: 1536-dimensional vector
```

### 6. Storage
```sql
INSERT INTO knowledge_base (tenant_id, category, content, embedding)
VALUES ($1, $2, $3, $4::vector);
```

## Retrieval During Calls

### Search Function
```typescript
async searchRelevantKnowledge(query: string, tenantId: string, topK: number = 5)
```

### Flow
1. Generate embedding for query
2. Check Redis cache (`knowledge:{tenantId}:{queryHash}`)
3. If miss: vector similarity search
```sql
SELECT category, content
FROM knowledge_base
WHERE tenant_id = $1 OR tenant_id IS NULL
ORDER BY embedding <=> $2::vector
LIMIT $3
```
4. Cache results in Redis
5. Return top-K chunks

### Tenant Isolation
- Tenant-specific knowledge: `WHERE tenant_id = $1`
- Global knowledge (shared): `WHERE tenant_id IS NULL`
- Combined: `WHERE tenant_id = $1 OR tenant_id IS NULL`

## Global Knowledge

On gateway boot, `knowledgeService.ingestFromFileOnce()`:
- Reads `data/knowledge_base.txt`
- Chunks by category (HVAC, plumbing, electrical)
- Stores with `tenant_id = NULL` (accessible to all)
- Deduplicates via content hash in `knowledge_ingestion_runs`

## Caching

**File:** `services/knowledge/knowledge.cache.ts`

- Cache key: `knowledge:{tenantId}:{queryHash}`
- TTL: 300 seconds
- Invalidated on knowledge CRUD operations
- Stats endpoint: `GET /api/v1/knowledge/cache/stats`

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/knowledge` | List entries for tenant |
| POST | `/api/v1/knowledge` | Ingest text manually |
| POST | `/api/v1/knowledge/upload` | Upload file |
| POST | `/api/v1/knowledge/ingest-url` | Scrape website |
| GET | `/api/v1/knowledge/files` | List uploaded files |
| GET | `/api/v1/knowledge/files/:id` | File processing status |
| POST | `/api/v1/knowledge/files/:id/reprocess` | Retry failed file |
| DELETE | `/api/v1/knowledge/:id` | Delete entry |
| DELETE | `/api/v1/knowledge/files/:id` | Delete file + entries |

## Database Tables

### `knowledge_base`
```sql
id uuid, tenant_id uuid (nullable), category text, content text,
embedding vector(1536), created_at timestamptz
```
**Index:** IVFFlat on embedding for cosine similarity

### `knowledge_files`
```sql
id uuid, tenant_id uuid, file_name text, file_type text,
file_size integer, status text, chunk_count integer,
error text, created_at timestamptz, updated_at timestamptz
```

### `knowledge_ingestion_runs`
```sql
id uuid, source text, content_hash text (unique), created_at timestamptz
```

## Categories

- `hvac` — HVAC terminology and procedures
- `plumbing` — Plumbing knowledge
- `electrical` — Electrical knowledge
- `general` — General business info
- `medical` — Medical terminology
- `legal` — Legal terminology
- `real_estate` — Real estate knowledge
