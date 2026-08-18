-- 065_halla_ai_me_localisation.sql
-- Halla AI — Middle East / GCC localisation.
-- Additive only: no existing column is dropped or renamed.
--
-- Changes:
--   1. voice_tenants  — default currency AED, default language 'ar', default timezone Asia/Dubai
--   2. subscriptions  — default currency 'aed'
--   3. crm_deals      — default currency 'AED' (already added in 064, updating default)
--   4. whatsapp_connections — dedicated WhatsApp Business table (GCC primary channel)
--   5. tenant_region  — lightweight region tag on voice_tenants for analytics/routing
--   6. channel_connections — add 'sms_wa' channel option for WhatsApp-native SMS fallback
--   7. seed helper view — v_me_channel_priority (WhatsApp first for GCC tenants)

-- ─── 1. voice_tenants: ME defaults ──────────────────────────────────────────

-- Default currency to AED for new tenants
ALTER TABLE public.voice_tenants
  ALTER COLUMN currency SET DEFAULT 'AED';

-- Default language to Arabic for new tenants
-- (existing rows keep their current default_language; only new inserts are affected)
ALTER TABLE public.voice_tenants
  ALTER COLUMN default_language SET DEFAULT 'ar';

-- Default timezone to Asia/Dubai (UTC+4, covers UAE)
-- Tenants in KSA should set Asia/Riyadh, Qatar → Asia/Qatar manually.
ALTER TABLE public.voice_tenants
  ALTER COLUMN timezone SET DEFAULT 'Asia/Dubai';

-- Region tag for analytics/routing segmentation
ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS region TEXT DEFAULT 'gcc'
    CHECK (region IN ('gcc', 'mena', 'us', 'eu', 'apac', 'other'));

-- Diagnostic fee default: set to 0 (no US HVAC pricing assumption for ME)
ALTER TABLE public.voice_tenants
  ALTER COLUMN diagnostic_fee SET DEFAULT 0;

-- ─── 2. subscriptions: AED currency ─────────────────────────────────────────

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'aed';

ALTER TABLE public.subscriptions
  ALTER COLUMN currency SET DEFAULT 'aed';

-- ─── 3. crm_deals: AED currency ─────────────────────────────────────────────

ALTER TABLE public.crm_deals
  ALTER COLUMN currency SET DEFAULT 'AED';

-- ─── 4. whatsapp_connections — WhatsApp Business API per tenant ──────────────
-- WhatsApp is the dominant messaging channel in the GCC. Each tenant can link
-- one WhatsApp Business Account (WABA) via the Meta Business API.

CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,

  -- Meta / WhatsApp Business credentials (encrypted at application layer)
  waba_id                 TEXT,                     -- WhatsApp Business Account ID
  phone_number_id         TEXT,                     -- META phone number ID
  access_token_enc        TEXT,                     -- Encrypted access token
  webhook_verify_token    TEXT,                     -- Inbound webhook verify token

  -- Connection state
  status                  TEXT NOT NULL DEFAULT 'not_connected'
                            CHECK (status IN ('not_connected', 'connected', 'error', 'pending')),
  display_phone_number    TEXT,                     -- e.g. +971 50 123 4567
  display_name            TEXT,                     -- Business display name on WhatsApp

  -- Feature flags
  enable_inbound          BOOLEAN NOT NULL DEFAULT TRUE,
  enable_outbound         BOOLEAN NOT NULL DEFAULT TRUE,
  enable_templates        BOOLEAN NOT NULL DEFAULT FALSE,

  config                  JSONB DEFAULT '{}'::jsonb,
  error_message           TEXT,
  connected_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_tenant
  ON public.whatsapp_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_status
  ON public.whatsapp_connections(status);

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage WhatsApp connections"
  ON public.whatsapp_connections FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));

-- updated_at trigger
CREATE TRIGGER trg_whatsapp_connections_updated_at
  BEFORE UPDATE ON public.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 5. channel_connections: add 'sms_wa' ────────────────────────────────────
-- Allow 'sms_wa' as a valid channel (WhatsApp-native SMS fallback)

ALTER TABLE public.channel_connections
  DROP CONSTRAINT IF EXISTS channel_connections_channel_check;

ALTER TABLE public.channel_connections
  ADD CONSTRAINT channel_connections_channel_check
    CHECK (channel IN ('whatsapp', 'web_chat', 'instagram', 'facebook', 'sms_wa'));

-- ─── 6. whatsapp_message_templates — pre-approved META templates ─────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  template_name   TEXT NOT NULL,
  language_code   TEXT NOT NULL DEFAULT 'ar',   -- 'ar', 'en', 'ur', etc.
  category        TEXT NOT NULL DEFAULT 'UTILITY'
                    CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'paused')),
  components      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- META template components
  meta_template_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, template_name, language_code)
);

CREATE INDEX IF NOT EXISTS idx_wa_templates_tenant
  ON public.whatsapp_message_templates(tenant_id);

ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage WhatsApp templates"
  ON public.whatsapp_message_templates FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));

-- ─── 7. ai_agents: Arabic-aware fields ──────────────────────────────────────

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS rtl_mode BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS arabic_dialect TEXT DEFAULT 'msa'
    CHECK (arabic_dialect IN ('msa', 'gulf', 'levantine', 'egyptian'));
  -- msa = Modern Standard Arabic (default)
  -- gulf = خليجي (Gulf dialect — UAE, KSA, Kuwait, Qatar, Bahrain)

-- ─── 8. voice_tenants: WhatsApp as primary channel flag ──────────────────────

ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS primary_channel TEXT DEFAULT 'voice'
    CHECK (primary_channel IN ('voice', 'whatsapp', 'web_chat'));

-- For GCC market, WhatsApp is typically the primary inbound channel
-- Tenants can change this from the dashboard Channels settings page.

-- ─── 9. Convenience view: ME channel priority ────────────────────────────────

CREATE OR REPLACE VIEW public.v_tenant_me_channels AS
SELECT
  vt.id                   AS tenant_id,
  vt.company_name,
  vt.region,
  vt.primary_channel,
  vt.default_language,
  vt.timezone,
  vt.currency,
  wc.status               AS whatsapp_status,
  wc.display_phone_number AS whatsapp_number,
  (
    SELECT status FROM public.channel_connections cc
    WHERE cc.tenant_id = vt.id AND cc.channel = 'web_chat' LIMIT 1
  )                       AS web_chat_status
FROM public.voice_tenants vt
LEFT JOIN public.whatsapp_connections wc ON wc.tenant_id = vt.id
WHERE vt.region IN ('gcc', 'mena');

-- Grant read to service role
GRANT SELECT ON public.v_tenant_me_channels TO service_role;

-- ─── Summary ─────────────────────────────────────────────────────────────────
-- After applying this migration:
--   • New voice_tenants default to: currency=AED, language=ar, tz=Asia/Dubai, region=gcc
--   • New subscriptions default to: currency=aed
--   • WhatsApp Business connections table available per tenant
--   • WhatsApp message templates table available per tenant
--   • ai_agents supports RTL mode and Arabic dialect selection
--   • channel_connections extended with sms_wa channel
--   • v_tenant_me_channels view provides quick GCC/MENA tenant overview
