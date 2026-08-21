-- ============================================
-- Outbound calling: direction tracking + campaign wiring
-- ============================================

ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
ADD COLUMN IF NOT EXISTS from_number TEXT,
ADD COLUMN IF NOT EXISTS to_number TEXT,
ADD COLUMN IF NOT EXISTS campaign_call_id UUID REFERENCES public.campaign_calls(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS outbound_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_calls_direction ON public.calls(tenant_id, direction, created_at DESC);

-- Reminder/follow-up scheduling on campaign_calls: when to dial and why.
ALTER TABLE public.campaign_calls
ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT 'campaign' CHECK (purpose IN ('campaign', 'reminder', 'follow_up', 'click_to_call')),
ADD COLUMN IF NOT EXISTS context JSONB,
ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_calls_pending_schedule
  ON public.campaign_calls(status, scheduled_at)
  WHERE status = 'pending';
