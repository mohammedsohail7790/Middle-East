-- Migration: Automation System
-- Description: Add automation rules table for automated follow-ups and reminders
-- Date: 2026-04-27

-- Create automation_rules table
CREATE TABLE IF NOT EXISTS public.automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.voice_tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trigger TEXT NOT NULL CHECK (trigger IN ('call_ended', 'appointment_created', 'lead_created', 'appointment_reminder')),
    action TEXT NOT NULL CHECK (action IN ('send_sms', 'send_email', 'create_task')),
    template TEXT NOT NULL,
    delay INTEGER DEFAULT 0, -- minutes
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on tenant_id and trigger for fast lookups
CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant_trigger 
ON public.automation_rules(tenant_id, trigger) 
WHERE enabled = true;

-- Create index on tenant_id for listing
CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant 
ON public.automation_rules(tenant_id);

-- Enable RLS
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's automation rules"
ON public.automation_rules FOR SELECT
USING (tenant_id IN (
    SELECT id FROM public.voice_tenants 
    WHERE id = (current_setting('app.current_tenant_id', true))::uuid
));

CREATE POLICY "Users can create automation rules for their tenant"
ON public.automation_rules FOR INSERT
WITH CHECK (tenant_id IN (
    SELECT id FROM public.voice_tenants 
    WHERE id = (current_setting('app.current_tenant_id', true))::uuid
));

CREATE POLICY "Users can update their tenant's automation rules"
ON public.automation_rules FOR UPDATE
USING (tenant_id IN (
    SELECT id FROM public.voice_tenants 
    WHERE id = (current_setting('app.current_tenant_id', true))::uuid
));

CREATE POLICY "Users can delete their tenant's automation rules"
ON public.automation_rules FOR DELETE
USING (tenant_id IN (
    SELECT id FROM public.voice_tenants 
    WHERE id = (current_setting('app.current_tenant_id', true))::uuid
));

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_automation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER automation_rules_updated_at
    BEFORE UPDATE ON public.automation_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_automation_rules_updated_at();

-- Insert default automation rules for existing tenants
INSERT INTO public.automation_rules (tenant_id, name, trigger, action, template, enabled)
SELECT 
    id as tenant_id,
    'Call Follow-up' as name,
    'call_ended' as trigger,
    'send_sms' as action,
    'Thank you for calling ' || company_name || '! We''ve received your request and will get back to you shortly. Reply to this message if you have any questions.' as template,
    true as enabled
FROM public.voice_tenants
ON CONFLICT DO NOTHING;

-- Add comment
COMMENT ON TABLE public.automation_rules IS 'Automation rules for automated follow-ups, reminders, and notifications';

