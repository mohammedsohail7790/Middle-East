-- ============================================================================
-- Call IQ — Knowledge Files Table
-- Tracks uploaded files, website ingests, and their processing status
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.knowledge_files (
    id              TEXT PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    file_type       TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt', 'csv', 'website', 'text')),
    file_size       INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    chunk_count     INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_files_tenant ON public.knowledge_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_status ON public.knowledge_files(status);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'knowledge_base' AND column_name = 'source'
    ) THEN
        ALTER TABLE public.knowledge_base ADD COLUMN source TEXT;
    END IF;
END $$;

ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_files_tenant_select ON public.knowledge_files;
DROP POLICY IF EXISTS knowledge_files_tenant_insert ON public.knowledge_files;
DROP POLICY IF EXISTS knowledge_files_tenant_update ON public.knowledge_files;
DROP POLICY IF EXISTS knowledge_files_tenant_delete ON public.knowledge_files;

CREATE POLICY knowledge_files_tenant_select ON public.knowledge_files
    FOR SELECT USING (
      tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid())
    );

CREATE POLICY knowledge_files_tenant_insert ON public.knowledge_files
    FOR INSERT WITH CHECK (
      tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid())
    );

CREATE POLICY knowledge_files_tenant_update ON public.knowledge_files
    FOR UPDATE USING (
      tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid())
    )
    WITH CHECK (
      tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid())
    );

CREATE POLICY knowledge_files_tenant_delete ON public.knowledge_files
    FOR DELETE USING (
      tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid())
    );

CREATE POLICY knowledge_files_service_role ON public.knowledge_files
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_knowledge_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_files_updated_at ON public.knowledge_files;
CREATE TRIGGER trg_knowledge_files_updated_at
    BEFORE UPDATE ON public.knowledge_files
    FOR EACH ROW
    EXECUTE FUNCTION public.update_knowledge_files_updated_at();
