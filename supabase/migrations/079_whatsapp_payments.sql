-- 079: WhatsApp payment links
-- A tenant can connect its own Stripe account (a restricted API key) so staff can send a payment link inside a WhatsApp chat.
-- The key is stored encrypted (INTEGRATION_CREDENTIALS_KEY), same as the WhatsApp access token. Additive only.

ALTER TABLE public.whatsapp_numbers ADD COLUMN IF NOT EXISTS stripe_key_enc TEXT;
