-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- Creates a trial subscription for the Halla AI demo tenant (GCC / Middle East)
-- Currency: AED

INSERT INTO public.subscriptions (tenant_id, plan, status, currency, current_period_start, current_period_end, trial_end)
VALUES (
  '2a9ea1e6-fa09-497c-8107-e704af6b1802',
  'professional',
  'trialing',
  'aed',
  NOW(),
  NOW() + INTERVAL '30 days',
  NOW() + INTERVAL '14 days'
)
ON CONFLICT (tenant_id) DO UPDATE SET
  plan = 'professional',
  status = 'trialing',
  currency = 'aed',
  current_period_start = NOW(),
  current_period_end = NOW() + INTERVAL '30 days',
  updated_at = NOW();
