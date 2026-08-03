-- Fix knowledge_files tenant FK (use voice_tenants, not public.tenants)

CREATE TABLE IF NOT EXISTS public.knowledge_files (
    id              TEXT PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    file_name       TEXT NOT NULL,
    file_type       TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt', 'csv', 'website', 'text', 'md')),
    file_size       INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    chunk_count     INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'knowledge_files'
  ) THEN
    ALTER TABLE public.knowledge_files DROP CONSTRAINT IF EXISTS knowledge_files_tenant_id_fkey;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'voice_tenants'
  ) THEN
    ALTER TABLE public.knowledge_files
      ADD CONSTRAINT knowledge_files_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.voice_tenants(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;
