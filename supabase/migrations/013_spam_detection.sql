-- Call Spam Log Table
-- Tracks spam/robocall detections for analytics and blocking
CREATE TABLE IF NOT EXISTS public.call_spam_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id),
    call_sid TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_spam_log_tenant ON public.call_spam_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_spam_log_phone ON public.call_spam_log(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_spam_log_created ON public.call_spam_log(created_at DESC);

-- Add working_hours to voice_tenants metadata (already stored as JSONB, no schema change needed)
-- Just ensure the column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'voice_tenants' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.voice_tenants ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
END $$;
