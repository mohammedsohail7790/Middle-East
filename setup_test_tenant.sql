-- ============================================
-- Quick Setup: Create Test Tenant for Voice Calls
-- ============================================
-- Run this in Supabase SQL Editor

-- Step 1: Create a test tenant for your Twilio number
INSERT INTO public.voice_tenants (
    owner_user_id,
    company_name,
    phone_number,
    default_language,
    timezone,
    diagnostic_fee,
    transfer_phone_number,
    call_handling_mode,
    voice_services,
    voice_tone,
    voice_questions,
    zapier_webhook_url
) VALUES (
    -- Use the first user in your system (or replace with specific user ID)
    (SELECT id FROM auth.users ORDER BY created_at LIMIT 1),
    
    -- Company name (customize this)
    'ABC HVAC Services',
    
    -- Your Twilio phone number (MUST match exactly)
    '+19193715609',
    
    -- Language
    'en',
    
    -- Timezone
    'America/New_York',
    
    -- Diagnostic fee
    125,
    
    -- Transfer phone number (your cell phone or office line)
    '+19193715609',
    
    -- Call handling mode: 'message' (take message), 'transfer' (transfer to human), 'both' (ask caller)
    'message',
    
    -- Services offered (customize for your business)
    '["AC Repair", "Heating Repair", "AC Installation", "Heating Installation", "Maintenance Plans", "Emergency Service"]'::jsonb,
    
    -- Voice tone (customize personality)
    'friendly, professional, and helpful. Keep responses concise and conversational.',
    
    -- Questions to ask callers (customize)
    '[
        "What service do you need help with?",
        "What is your name?",
        "What is the best phone number to reach you?",
        "When would you like us to come out?"
    ]'::jsonb,
    
    -- Zapier webhook (optional - leave as is or add your webhook URL)
    'https://hooks.zapier.com/hooks/catch/27063740/uj0ecm6/'
)
ON CONFLICT (phone_number) DO UPDATE
SET 
    company_name = EXCLUDED.company_name,
    voice_services = EXCLUDED.voice_services,
    voice_tone = EXCLUDED.voice_tone,
    voice_questions = EXCLUDED.voice_questions,
    updated_at = now();

-- Step 2: Get the tenant ID (copy this UUID!)
SELECT 
    id,
    company_name,
    phone_number,
    created_at
FROM public.voice_tenants
WHERE phone_number = '+19193715609';

-- Step 3: Verify the tenant configuration
SELECT 
    id,
    company_name,
    phone_number,
    voice_tone,
    voice_services,
    voice_questions,
    call_handling_mode,
    transfer_phone_number
FROM public.voice_tenants
WHERE phone_number = '+19193715609';

-- ============================================
-- IMPORTANT: Copy the 'id' (UUID) from above
-- and update apps/gateway/.env:
-- DEV_TENANT_ID=<paste-uuid-here>
-- ============================================

-- Optional: Create additional test tenants for different businesses
-- Just change the phone_number and company details

-- Example: Plumbing company
/*
INSERT INTO public.voice_tenants (
    owner_user_id,
    company_name,
    phone_number,
    default_language,
    timezone,
    diagnostic_fee,
    transfer_phone_number,
    call_handling_mode,
    voice_services,
    voice_tone,
    voice_questions
) VALUES (
    (SELECT id FROM auth.users ORDER BY created_at LIMIT 1),
    'Quick Fix Plumbing',
    '+15555551234', -- Different phone number
    'en',
    'America/Los_Angeles',
    150,
    '+15555551234',
    'both',
    '["Leak Repair", "Drain Cleaning", "Water Heater Repair", "Pipe Replacement", "Emergency Plumbing"]'::jsonb,
    'professional, direct, and efficient. Prioritize emergencies.',
    '[
        "What plumbing issue are you experiencing?",
        "Is there active water damage?",
        "What is your name?",
        "What is your phone number?",
        "What is your address?"
    ]'::jsonb
);
*/
