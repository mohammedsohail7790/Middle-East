-- Stripe invoice webhooks upsert by stripe_invoice_id (ON CONFLICT), which
-- requires a unique constraint that was never added when the invoices table
-- was created in 004_complete_feature_set.sql. Postgres treats multiple NULLs
-- as distinct in a unique index, so this is safe for rows with no Stripe id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_stripe_invoice_id_unique
  ON public.invoices (stripe_invoice_id);
