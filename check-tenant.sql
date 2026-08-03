-- Check if tenant exists with the correct phone number
SELECT 
    id,
    company_name,
    phone_number,
    voice_tone,
    call_handling_mode,
    created_at
FROM public.voice_tenants
WHERE phone_number = '+19193715609'
   OR id = '2a9ea1e6-fa09-497c-8107-e704af6b1802'::uuid;

-- If no results, create the tenant:
INSERT INTO public.voice_tenants (
    id,
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
    '2a9ea1e6-fa09-497c-8107-e704af6b1802'::uuid,
    (SELECT id FROM auth.users ORDER BY created_at LIMIT 1),
    'Call IQ Demo',
    '+19193715609',
    'en',
    'America/New_York',
    125,
    '+19193715609',
    'message',
    '["HVAC Repair", "AC Installation", "Heating Service", "Plumbing", "Electrical Work", "Emergency Service"]'::jsonb,
    'friendly, professional, and helpful. Keep responses concise and conversational.',
    '[
        "Hi! How can I help you today?",
        "What service do you need?",
        "What is your name?",
        "What is the best phone number to reach you?",
        "When would you like us to come out?"
    ]'::jsonb,
    'https://hooks.zapier.com/hooks/catch/27063740/uj0ecm6/'
)
ON CONFLICT (id) DO UPDATE
SET 
    phone_number = EXCLUDED.phone_number,
    company_name = EXCLUDED.company_name,
    voice_services = EXCLUDED.voice_services,
    voice_tone = EXCLUDED.voice_tone,
    voice_questions = EXCLUDED.voice_questions,
    updated_at = now();

-- Verify it was created/updated
SELECT 
    id,
    company_name,
    phone_number,
    voice_tone,
    call_handling_mode,
    created_at
FROM public.voice_tenants
WHERE id = '2a9ea1e6-fa09-497c-8107-e704af6b1802'::uuid;
