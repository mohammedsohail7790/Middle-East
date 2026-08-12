-- Create Test User in Supabase
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/btgwgfphgdgnoaqtopwy/sql

-- 1. Create test user in auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'test@hallaai.com',
  crypt('Test123!', gen_salt('bf')), -- Password: Test123!
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Test User"}',
  false,
  '',
  '',
  ''
) ON CONFLICT (email) DO NOTHING;

-- 2. Create tenant for test user
INSERT INTO public.tenants (
  id,
  name,
  email,
  phone_number,
  business_name,
  industry,
  subscription_tier,
  subscription_status,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'Test User',
  'test@hallaai.com',
  '+97150000001',         -- UAE mobile placeholder
  'Halla AI Test Tenant',
  'Technology',
  'professional',
  'active',
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- Test Credentials:
-- Email: test@hallaai.com
-- Password: Test123!
