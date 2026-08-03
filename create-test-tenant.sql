-- Create a test voice tenant for development/testing
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/btgwgfphgdgnoaqtopwy/sql

-- First, let's find your user ID (replace with your actual email)
-- SELECT id FROM auth.users WHERE email = 'your-email@example.com';

-- Insert test tenant (replace 'YOUR_USER_ID_HERE' with your actual user ID from auth.users)
INSERT INTO public.voice_tenants (
  owner_user_id,
  company_name,
  phone_number,
  default_language,
  timezone,
  diagnostic_fee,
  voice_services,
  voice_tone,
  voice_questions,
  metadata
) VALUES (
  'YOUR_USER_ID_HERE',  -- <-- REPLACE THIS WITH YOUR ACTUAL USER ID
  'Test HVAC Company',
  '+19193715609',
  'en',
  'UTC',
  125,
  '["HVAC", "Plumbing", "Electrical"]'::jsonb,
  'friendly, concise, and professional',
  '["What service are you calling about?", "When would you like to schedule?", "Any urgent details?"]'::jsonb,
  '{"environment": "development", "auto_created": true}'::jsonb
)
RETURNING id, company_name, phone_number;

-- After running this query:
-- 1. Copy the returned tenant ID
-- 2. Go to: http://localhost:3000/settings
-- 3. Paste the tenant ID in "Tenant Configuration"
-- 4. Click "Save"
-- 5. Visit: http://localhost:3000/dashboard
