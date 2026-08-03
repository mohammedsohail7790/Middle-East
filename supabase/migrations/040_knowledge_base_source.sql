-- knowledge_base.source — used to tag template chunks and file ingest provenance
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_tenant_source
  ON public.knowledge_base (tenant_id, source)
  WHERE source IS NOT NULL;
