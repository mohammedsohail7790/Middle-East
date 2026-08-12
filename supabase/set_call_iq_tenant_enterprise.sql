-- Halla AI — Upgrade demo tenant to Enterprise subscription
-- Run in Supabase SQL Editor
-- Replace the tenant_id UUID and email with your real values.

-- Link user metadata
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'tenant_id', '2a9ea1e6-fa09-497c-8107-e704af6b1802',
  'tier', 'ENTERPRISE',
  'company_name', 'Halla AI'
)
WHERE email = 'smd49881@gmail.com';

INSERT INTO public.subscriptions (
  tenant_id,
  plan,
  status,
  currency,
  current_period_start,
  current_period_end
)
VALUES (
  '2a9ea1e6-fa09-497c-8107-e704af6b1802',
  'enterprise',
  'active',
  'aed',
  NOW(),
  NOW() + INTERVAL '1 year'
)
ON CONFLICT (tenant_id) DO UPDATE SET
  plan = 'enterprise',
  status = 'active',
  currency = 'aed',
  current_period_start = NOW(),
  current_period_end = NOW() + INTERVAL '1 year',
  updated_at = NOW();

-- Verify
SELECT vt.company_name, vt.phone_number, u.email, s.plan, s.status, s.currency
FROM public.voice_tenants vt
LEFT JOIN auth.users u ON u.id = vt.owner_user_id
LEFT JOIN public.subscriptions s ON s.tenant_id = vt.id
WHERE vt.id = '2a9ea1e6-fa09-497c-8107-e704af6b1802';
