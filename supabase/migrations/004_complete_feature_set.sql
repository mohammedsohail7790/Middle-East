-- ============================================
-- Call IQ - Complete Feature Set Migration
-- Adds all missing features to match/exceed SkipCalls
-- ============================================

-- ============================================
-- 1. CALL TRANSCRIPTS & RECORDINGS
-- ============================================

-- Add recording and transcript fields to calls table
ALTER TABLE public.calls 
ADD COLUMN IF NOT EXISTS recording_url TEXT,
ADD COLUMN IF NOT EXISTS recording_duration INTEGER, -- seconds
ADD COLUMN IF NOT EXISTS transcript TEXT,
ADD COLUMN IF NOT EXISTS transcript_summary TEXT,
ADD COLUMN IF NOT EXISTS sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
ADD COLUMN IF NOT EXISTS sentiment_score DECIMAL(3,2), -- 0.00 to 1.00
ADD COLUMN IF NOT EXISTS call_tags TEXT[], -- ['sales', 'support', 'emergency']
ADD COLUMN IF NOT EXISTS call_disposition TEXT, -- 'booked', 'callback', 'not_interested', 'voicemail'
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index for transcript search
CREATE INDEX IF NOT EXISTS idx_calls_transcript_search ON public.calls USING gin(to_tsvector('english', transcript));

-- ============================================
-- 2. SMS SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'received')),
  twilio_sid TEXT,
  error_message TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  delivered_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_sms_tenant_id ON public.sms_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_phone_number ON public.sms_messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_created_at ON public.sms_messages(created_at DESC);

-- SMS Templates
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  trigger TEXT NOT NULL, -- 'after_call', 'appointment_reminder_24h', 'appointment_reminder_1h', 'follow_up', 'manual'
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- SMS Conversations (grouping messages)
CREATE TABLE IF NOT EXISTS public.sms_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  customer_name TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  unread_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id, phone_number)
);

-- ============================================
-- 3. CALENDAR INTEGRATION
-- ============================================

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'apple', 'calendly', 'cal_com')),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  calendar_id TEXT,
  calendar_name TEXT,
  sync_enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Calendar Events (cached from external calendars)
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_connection_id UUID REFERENCES public.calendar_connections(id) ON DELETE CASCADE NOT NULL,
  external_event_id TEXT NOT NULL,
  title TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  is_busy BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(calendar_connection_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_time ON public.calendar_events(start_time, end_time);

-- ============================================
-- 4. ENHANCED APPOINTMENTS
-- ============================================

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS confirmation_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_by TEXT, -- 'customer', 'business', 'system'
ADD COLUMN IF NOT EXISTS rescheduled_from UUID REFERENCES public.appointments(id),
ADD COLUMN IF NOT EXISTS external_calendar_event_id TEXT;

-- ============================================
-- 5. LEAD MANAGEMENT
-- ============================================

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'won', 'lost', 'nurturing')),
ADD COLUMN IF NOT EXISTS assigned_to UUID, -- Will reference team_members
ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS source TEXT, -- 'inbound_call', 'outbound_call', 'sms', 'web_form'
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON public.leads(next_follow_up_at);

-- Lead Activities (timeline)
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL, -- 'call', 'sms', 'email', 'note', 'status_change', 'score_change'
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_by UUID, -- team member
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON public.lead_activities(lead_id, created_at DESC);

-- ============================================
-- 6. TEAM MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'manager', 'agent')),
  permissions JSONB DEFAULT '{}',
  phone_number TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_active_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id, email)
);

-- Add foreign key to leads
ALTER TABLE public.leads
ADD CONSTRAINT fk_leads_assigned_to 
FOREIGN KEY (assigned_to) REFERENCES public.team_members(id) ON DELETE SET NULL;

-- Team Notifications
CREATE TABLE IF NOT EXISTS public.team_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL, -- 'new_lead', 'missed_call', 'appointment_booked', 'sms_received'
  channels TEXT[] DEFAULT ARRAY['email'], -- 'email', 'sms', 'slack', 'push'
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ============================================
-- 7. BUSINESS HOURS & ROUTING
-- ============================================

CREATE TABLE IF NOT EXISTS public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  is_closed BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id, date)
);

-- After-hours settings
ALTER TABLE public.voice_tenants
ADD COLUMN IF NOT EXISTS after_hours_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS after_hours_message TEXT,
ADD COLUMN IF NOT EXISTS after_hours_action TEXT DEFAULT 'voicemail' CHECK (after_hours_action IN ('voicemail', 'forward', 'ai_limited'));

-- ============================================
-- 8. BILLING & SUBSCRIPTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'business', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'paused')),
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  trial_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id)
);

CREATE TABLE IF NOT EXISTS public.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_calls INTEGER DEFAULT 0,
  total_minutes INTEGER DEFAULT 0,
  total_sms INTEGER DEFAULT 0,
  total_recordings INTEGER DEFAULT 0,
  amount_due DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id, period_start)
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  stripe_invoice_id TEXT,
  amount_due DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  invoice_pdf_url TEXT,
  due_date DATE,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ============================================
-- 9. ANALYTICS & METRICS
-- ============================================

CREATE TABLE IF NOT EXISTS public.daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  total_calls INTEGER DEFAULT 0,
  answered_calls INTEGER DEFAULT 0,
  missed_calls INTEGER DEFAULT 0,
  total_minutes INTEGER DEFAULT 0,
  avg_call_duration INTEGER DEFAULT 0,
  total_leads INTEGER DEFAULT 0,
  qualified_leads INTEGER DEFAULT 0,
  total_appointments INTEGER DEFAULT 0,
  confirmed_appointments INTEGER DEFAULT 0,
  total_sms INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON public.daily_metrics(tenant_id, date DESC);

-- ============================================
-- 10. KNOWLEDGE BASE
-- ============================================

CREATE TABLE IF NOT EXISTS public.knowledge_base_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'page' CHECK (type IN ('page', 'file', 'faq', 'policy')),
  file_url TEXT,
  file_type TEXT,
  tags TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_tenant ON public.knowledge_base_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_search ON public.knowledge_base_items USING gin(to_tsvector('english', title || ' ' || content));

-- ============================================
-- 11. CUSTOMERS
-- ============================================

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT,
  full_name TEXT,
  company_name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  tags TEXT[],
  notes TEXT,
  total_calls INTEGER DEFAULT 0,
  total_appointments INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  last_contact_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);

-- Link calls to customers
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- Link leads to customers
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- ============================================
-- 12. CAMPAIGNS (Outbound)
-- ============================================

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('outbound_call', 'sms_blast', 'email')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  target_list JSONB, -- Array of phone numbers/emails
  message_template TEXT,
  schedule_at TIMESTAMP WITH TIME ZONE,
  total_targets INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.campaign_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'calling', 'completed', 'failed', 'no_answer')),
  result TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  called_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ============================================
-- 13. NOTIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  team_member_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'new_lead', 'missed_call', 'appointment_booked', 'sms_received'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_team_member ON public.notifications(team_member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(team_member_id, is_read) WHERE is_read = FALSE;

-- ============================================
-- 14. WEBHOOKS
-- ============================================

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL, -- ['call.completed', 'lead.created', 'appointment.booked']
  secret TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES public.webhooks(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ============================================
-- 15. RLS POLICIES
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Create policies (tenant-based access)
-- SMS Messages
CREATE POLICY "Users can view their tenant's SMS messages"
  ON public.sms_messages FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can insert their tenant's SMS messages"
  ON public.sms_messages FOR INSERT
  WITH CHECK (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

-- Team Members
CREATE POLICY "Users can view their tenant's team members"
  ON public.team_members FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can manage their tenant's team members"
  ON public.team_members FOR ALL
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

-- Customers
CREATE POLICY "Users can view their tenant's customers"
  ON public.customers FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can manage their tenant's customers"
  ON public.customers FOR ALL
  USING (tenant_id IN (SELECT id FROM public.voice_tenants WHERE owner_user_id = auth.uid()));

-- Similar policies for other tables...
-- (Add more as needed)

-- ============================================
-- 16. FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update customer stats
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.customers
    SET 
      total_calls = total_calls + 1,
      last_contact_at = NEW.created_at,
      updated_at = NOW()
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_customer_stats
AFTER INSERT ON public.calls
FOR EACH ROW
WHEN (NEW.customer_id IS NOT NULL)
EXECUTE FUNCTION update_customer_stats();

-- Function to calculate lead score
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_id UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  lead_record RECORD;
BEGIN
  SELECT * INTO lead_record FROM public.leads WHERE id = lead_id;
  
  -- Base score
  score := 50;
  
  -- Has email: +10
  IF lead_record.email IS NOT NULL THEN
    score := score + 10;
  END IF;
  
  -- Has phone: +10
  IF lead_record.phone IS NOT NULL THEN
    score := score + 10;
  END IF;
  
  -- Has appointment: +20
  IF EXISTS (SELECT 1 FROM public.appointments WHERE lead_id = lead_record.id) THEN
    score := score + 20;
  END IF;
  
  -- Recent contact: +10
  IF lead_record.last_contact_at > NOW() - INTERVAL '7 days' THEN
    score := score + 10;
  END IF;
  
  -- Cap at 100
  IF score > 100 THEN
    score := 100;
  END IF;
  
  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.sms_messages IS 'SMS messages sent and received';
COMMENT ON TABLE public.sms_templates IS 'SMS templates for automated messages';
COMMENT ON TABLE public.calendar_connections IS 'External calendar integrations';
COMMENT ON TABLE public.team_members IS 'Team members with role-based access';
COMMENT ON TABLE public.business_hours IS 'Business operating hours by day';
COMMENT ON TABLE public.subscriptions IS 'Stripe subscription management';
COMMENT ON TABLE public.customers IS 'Customer profiles and history';
COMMENT ON TABLE public.campaigns IS 'Outbound calling campaigns';

-- ============================================
-- COMPLETE!
-- ============================================
