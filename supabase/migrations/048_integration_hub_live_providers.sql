-- Mark previously "coming soon" integrations as live in the registry seed.
UPDATE public.integrations
SET ready = true, updated_at = NOW()
WHERE id IN ('clio', 'mycase', 'vagaro', 'mindbody', 'appfolio', 'yardi');
