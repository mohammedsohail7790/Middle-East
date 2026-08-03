-- Align subscription status values with Stripe + gateway (canceled/incomplete/unpaid).
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (
    status IN (
      'active',
      'cancelled',
      'canceled',
      'past_due',
      'trialing',
      'paused',
      'incomplete',
      'unpaid'
    )
  );
