-- 078: WhatsApp channel (Meta Cloud API)
-- A tenant's WhatsApp business number, the customer conversations on it, and every message in and out.
-- The access token is stored encrypted (INTEGRATION_CREDENTIALS_KEY); the gateway reads these tables with the service role.

CREATE TABLE IF NOT EXISTS public.whatsapp_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL UNIQUE,          -- Meta's id; the webhook routes by this
  waba_id TEXT,
  display_phone TEXT,
  access_token_enc TEXT,                         -- encrypted; falls back to WHATSAPP_ACCESS_TOKEN when null
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disabled', 'error')),
  ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,      -- false => messages are stored for staff only
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,                  -- E.164 with leading +
  customer_name TEXT,
  mode TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'human')),
  language TEXT,
  opted_out BOOLEAN NOT NULL DEFAULT FALSE,      -- STOP / unsubscribe: only replies to the customer's own messages, no reminders
  needs_attention BOOLEAN NOT NULL DEFAULT FALSE,
  last_inbound_at TIMESTAMPTZ,                   -- opens the 24h free-form window
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, customer_phone)
);
CREATE INDEX IF NOT EXISTS idx_wa_conv_tenant_recent ON public.whatsapp_conversations (tenant_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender TEXT NOT NULL DEFAULT 'customer' CHECK (sender IN ('customer', 'ai', 'staff', 'system')),
  wa_message_id TEXT,                            -- Meta's id; unique so webhook retries are dropped
  msg_type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  template_name TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_msg_wa_id ON public.whatsapp_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON public.whatsapp_messages (conversation_id, created_at);

-- Appointment WhatsApp reminders are tracked apart from the email ones so each channel sends once.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS wa_reminder_24h_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wa_confirmation_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE public.whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- whatsapp_numbers holds the encrypted token: end users get no direct access at all. The gateway is the only reader and returns a
-- token-free view to the dashboard. Writes to every table here also go through the gateway, so no write policy is granted.
REVOKE ALL ON public.whatsapp_numbers FROM authenticated, anon;
CREATE POLICY "Team reads whatsapp conversations" ON public.whatsapp_conversations FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE POLICY "Team reads whatsapp messages" ON public.whatsapp_messages FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
